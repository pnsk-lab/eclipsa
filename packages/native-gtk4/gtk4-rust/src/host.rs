use crate::loader::{
    BootstrapScript, BootstrapScriptLoading, DefaultBootstrapScriptLoader,
    NativeApplicationDescriptor, NativeDevManifest,
};
use crate::renderer::Gtk4RendererBridge;
use crate::tree::NativeNode;
use anyhow::{anyhow, bail, Context, Result};
use rquickjs::context::EvalOptions;
use rquickjs::prelude::Func;
use rquickjs::{Context as JsContext, Ctx, Function, Object, Persistent, Runtime};
use serde_json::json;
use std::cell::RefCell;
use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tungstenite::client::IntoClientRequest;
use tungstenite::handshake::client::Request as WebSocketRequest;
use tungstenite::http::HeaderValue;
use tungstenite::{connect, Error as WebSocketError, Message};

const VITE_RUNNER_SOURCE: &str = include_str!("./vite-runner.js");
const INITIAL_HMR_READY_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct EventHandlerKey {
    event_name: String,
    node_id: String,
}

#[derive(Clone, Debug)]
pub enum EventPayload {
    Bool(bool),
    Json(serde_json::Value),
    String(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HostUiAction {
    Click { node_id: String },
    Input { node_id: String, value: String },
    Toggle { node_id: String, value: bool },
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct PumpResult {
    pub needs_refresh: bool,
    pub requires_full_rebuild: bool,
}

#[derive(Default)]
struct DevSessionState {
    hmr_callback: Option<Persistent<Function<'static>>>,
    receiver: Option<Receiver<String>>,
    stop_hmr: Option<Arc<AtomicBool>>,
}

struct SpawnedHmrReceiver {
    initial_ready: Receiver<()>,
    receiver: Receiver<String>,
}

impl SpawnedHmrReceiver {
    fn wait_for_initial_ready(&self, timeout: Duration) -> bool {
        match self.initial_ready.recv_timeout(timeout) {
            Ok(()) => true,
            Err(RecvTimeoutError::Timeout) => false,
            Err(RecvTimeoutError::Disconnected) => false,
        }
    }
}

pub struct EclipsaGtk4Host {
    dev_state: Rc<RefCell<DevSessionState>>,
    event_handlers: Rc<RefCell<HashMap<EventHandlerKey, Persistent<Function<'static>>>>>,
    loader: Box<dyn BootstrapScriptLoading>,
    renderer: Rc<RefCell<Gtk4RendererBridge>>,
    context: JsContext,
    _runtime: Runtime,
}

impl EclipsaGtk4Host {
    pub fn new() -> Result<Self> {
        Self::with_loader(DefaultBootstrapScriptLoader::new())
    }

    pub fn with_loader(loader: impl BootstrapScriptLoading + 'static) -> Result<Self> {
        let runtime = Runtime::new()?;
        let context = JsContext::full(&runtime)?;
        Ok(Self {
            context,
            dev_state: Rc::new(RefCell::new(DevSessionState::default())),
            event_handlers: Rc::new(RefCell::new(HashMap::new())),
            loader: Box::new(loader),
            renderer: Rc::new(RefCell::new(Gtk4RendererBridge::default())),
            _runtime: runtime,
        })
    }

    pub fn boot(&mut self) -> Result<()> {
        let descriptor = self.loader.load()?;
        self.event_handlers.borrow_mut().clear();
        {
            let mut dev_state = self.dev_state.borrow_mut();
            if let Some(stop_hmr) = dev_state.stop_hmr.take() {
                stop_hmr.store(true, Ordering::Relaxed);
            }
            dev_state.hmr_callback = None;
            dev_state.receiver = None;
        }

        self.context.with(|ctx| -> Result<()> {
            self.install_console(ctx.clone())?;
            self.install_native_bridge(ctx.clone())?;

            match descriptor {
                NativeApplicationDescriptor::Script(ref bootstrap) => {
                    self.evaluate_bootstrap_script(ctx.clone(), bootstrap)?;
                }
                NativeApplicationDescriptor::Dev(ref manifest) => {
                    self.install_dev_runtime_bridge(ctx.clone(), manifest)?;
                    self.evaluate_native_dev_runtime(ctx.clone())?;
                }
            }

            self.run_pending_jobs(ctx.clone())?;
            Ok(())
        })?;

        if self.root().is_none() {
            bail!("Native bootstrap script did not publish a root node.");
        }

        Ok(())
    }

    pub fn boot_or_render_fallback(&mut self) -> Result<()> {
        if let Err(error) = self.boot() {
            self.renderer
                .borrow_mut()
                .render_fallback("Eclipsa Native GTK 4", &error.to_string());
            return Err(error);
        }
        Ok(())
    }

    pub fn dispatch_event(
        &mut self,
        node_id: &str,
        event_name: &str,
        payload: Option<EventPayload>,
    ) -> Result<()> {
        let key = EventHandlerKey {
            event_name: event_name.to_owned(),
            node_id: node_id.to_owned(),
        };
        let handler = self
            .event_handlers
            .borrow()
            .get(&key)
            .cloned()
            .ok_or_else(|| anyhow!("No event handler is registered for {node_id}#{event_name}."))?;

        self.context.with(|ctx| -> Result<()> {
            let function = handler.restore(&ctx)?;
            match payload {
                Some(EventPayload::Bool(value)) => {
                    function.call::<_, ()>((value,))?;
                }
                Some(EventPayload::String(ref value)) => {
                    function.call::<_, ()>((value.clone(),))?;
                }
                Some(EventPayload::Json(ref value)) => {
                    let payload_value = ctx.json_parse(serde_json::to_string(value)?)?;
                    function.call::<_, ()>((payload_value,))?;
                }
                None => {
                    function.call::<_, ()>(())?;
                }
            }
            self.run_pending_jobs(ctx.clone())?;
            Ok(())
        })
    }

    pub fn update_bool(&mut self, node_id: &str, key: &str, value: bool) {
        self.renderer
            .borrow_mut()
            .set_prop(node_id, key, if value { "true" } else { "false" });
        self.renderer.borrow_mut().publish(None);
    }

    pub fn update_string(&mut self, node_id: &str, key: &str, value: &str) {
        self.renderer.borrow_mut().set_prop(node_id, key, value);
        self.renderer.borrow_mut().publish(None);
    }

    pub fn apply_ui_action(&mut self, action: HostUiAction) -> Result<()> {
        match action {
            HostUiAction::Click { node_id } => self.dispatch_event(&node_id, "click", None),
            HostUiAction::Input { node_id, value } => {
                self.update_string(&node_id, "value", &value);
                self.dispatch_event(&node_id, "input", Some(EventPayload::String(value)))
            }
            HostUiAction::Toggle { node_id, value } => {
                self.update_bool(&node_id, "value", value);
                self.dispatch_event(&node_id, "toggle", Some(EventPayload::Bool(value)))
            }
        }
    }

    pub fn pump(&mut self, actions: impl IntoIterator<Item = HostUiAction>) -> Result<PumpResult> {
        for action in actions {
            self.apply_ui_action(action)?;
        }
        let processed_hmr_messages = self.process_hmr_messages()?;
        let needs_refresh = self.take_render_update();
        Ok(PumpResult {
            needs_refresh,
            requires_full_rebuild: needs_refresh && processed_hmr_messages,
        })
    }

    pub fn process_hmr_messages(&mut self) -> Result<bool> {
        let messages = {
            let mut drained = Vec::new();
            if let Some(receiver) = self.dev_state.borrow().receiver.as_ref() {
                while let Ok(message) = receiver.try_recv() {
                    drained.push(message);
                }
            }
            drained
        };

        if messages.is_empty() {
            return Ok(false);
        }

        let callback = self.dev_state.borrow().hmr_callback.clone();
        let Some(callback) = callback else {
            return Ok(false);
        };

        self.context.with(|ctx| -> Result<()> {
            for message in messages {
                if std::env::var_os("ECLIPSA_NATIVE_DEBUG_HMR").is_some() {
                    eprintln!("EclipsaNative HMR: {message}");
                }
                let function = callback.clone().restore(&ctx)?;
                function.call::<_, ()>((message,))?;
                self.run_pending_jobs(ctx.clone())?;
            }
            Ok(())
        })?;

        Ok(true)
    }

    pub fn root(&self) -> Option<NativeNode> {
        self.renderer.borrow().root().cloned()
    }

    pub fn take_render_update(&mut self) -> bool {
        self.renderer.borrow_mut().take_pending_publish()
    }

    fn evaluate_bootstrap_script(&self, ctx: Ctx<'_>, bootstrap: &BootstrapScript) -> Result<()> {
        let mut options = EvalOptions::default();
        options.global = true;
        options.filename = Some(bootstrap.origin.clone());
        ctx.eval_with_options::<(), _>(bootstrap.source.as_str(), options)?;
        Ok(())
    }

    fn evaluate_native_dev_runtime(&self, ctx: Ctx<'_>) -> Result<()> {
        let mut options = EvalOptions::default();
        options.global = true;
        options.filename = Some("vite-runner.js".to_owned());
        ctx.eval_with_options::<(), _>(VITE_RUNNER_SOURCE, options)?;
        self.call_boot_function(ctx)
    }

    fn call_boot_function(&self, ctx: Ctx<'_>) -> Result<()> {
        let globals = ctx.globals();
        let boot: Function<'_> = globals
            .get("__eclipsaBoot")
            .context("Missing __eclipsaBoot in native runtime.")?;
        boot.call::<_, ()>(())?;
        Ok(())
    }

    fn install_console(&self, ctx: Ctx<'_>) -> Result<()> {
        let console = Object::new(ctx.clone())?;
        console.set(
            "log",
            Func::from(|message: String| {
                eprintln!("EclipsaNative JS: {message}");
            }),
        )?;
        console.set(
            "error",
            Func::from(|message: String| {
                eprintln!("EclipsaNative JS error: {message}");
            }),
        )?;
        ctx.globals().set("console", console)?;
        Ok(())
    }

    fn install_native_bridge(&self, ctx: Ctx<'_>) -> Result<()> {
        let native_root = Object::new(ctx.clone())?;
        let renderer_object = Object::new(ctx.clone())?;
        let events_object = Object::new(ctx.clone())?;

        let renderer = Rc::clone(&self.renderer);
        renderer_object.set(
            "createElement",
            Func::from(move |type_name: String| -> String {
                renderer.borrow_mut().create_element(&type_name)
            }),
        )?;

        let renderer = Rc::clone(&self.renderer);
        renderer_object.set(
            "createText",
            Func::from(move |value: String| -> String {
                renderer.borrow_mut().create_text(&value)
            }),
        )?;

        let renderer = Rc::clone(&self.renderer);
        renderer_object.set(
            "insert",
            Func::from(
                move |parent_id: String, child_id: String, before_id: Option<String>| {
                    renderer
                        .borrow_mut()
                        .insert(&parent_id, &child_id, before_id.as_deref());
                },
            ),
        )?;

        let renderer = Rc::clone(&self.renderer);
        renderer_object.set(
            "remove",
            Func::from(move |parent_id: String, child_id: String| {
                renderer.borrow_mut().remove(&parent_id, &child_id);
            }),
        )?;

        let renderer = Rc::clone(&self.renderer);
        renderer_object.set(
            "reorder",
            Func::from(
                move |parent_id: String, child_id: String, before_id: Option<String>| {
                    renderer
                        .borrow_mut()
                        .reorder(&parent_id, &child_id, before_id.as_deref());
                },
            ),
        )?;

        let renderer = Rc::clone(&self.renderer);
        renderer_object.set(
            "setPropSerialized",
            Func::from(move |node_id: String, key: String, value: String| {
                renderer.borrow_mut().set_prop(&node_id, &key, &value);
            }),
        )?;

        let renderer = Rc::clone(&self.renderer);
        renderer_object.set(
            "removeProp",
            Func::from(move |node_id: String, key: String| {
                renderer.borrow_mut().remove_prop(&node_id, &key);
            }),
        )?;

        let renderer = Rc::clone(&self.renderer);
        renderer_object.set(
            "setText",
            Func::from(move |node_id: String, value: String| {
                renderer.borrow_mut().set_text(&node_id, &value);
            }),
        )?;

        let renderer = Rc::clone(&self.renderer);
        renderer_object.set(
            "publish",
            Func::from(move |root_id: Option<String>| {
                renderer.borrow_mut().publish(root_id.as_deref());
            }),
        )?;

        let event_handlers = Rc::clone(&self.event_handlers);
        events_object.set(
            "on",
            Func::from(
                move |node_id: String,
                      event_name: String,
                      handler: Persistent<Function<'static>>| {
                    event_handlers.borrow_mut().insert(
                        EventHandlerKey {
                            event_name,
                            node_id,
                        },
                        handler,
                    );
                },
            ),
        )?;

        native_root.set("renderer", renderer_object)?;
        native_root.set("events", events_object)?;
        ctx.globals().set("__eclipsaNative", native_root)?;
        ctx.eval::<(), _>(
            r#"
            {
              const nativeRoot = globalThis.__eclipsaNative
              const rawRenderer = nativeRoot.renderer
              nativeRoot.renderer = {
                ...rawRenderer,
                setProp(nodeID, key, value) {
                  if (value == null) {
                    rawRenderer.removeProp(nodeID, key)
                    return
                  }
                  if (typeof value === "boolean") {
                    rawRenderer.setPropSerialized(nodeID, key, value ? "true" : "false")
                    return
                  }
                  if (typeof value === "string" || typeof value === "number") {
                    rawRenderer.setPropSerialized(nodeID, key, String(value))
                    return
                  }
                  try {
                    rawRenderer.setPropSerialized(nodeID, key, JSON.stringify(value))
                  } catch {
                    rawRenderer.setPropSerialized(nodeID, key, String(value))
                  }
                },
              }
            }
            "#,
        )?;
        Ok(())
    }

    fn install_dev_runtime_bridge(&self, ctx: Ctx<'_>, manifest: &NativeDevManifest) -> Result<()> {
        let dev_manifest = Object::new(ctx.clone())?;
        dev_manifest.set("entry", manifest.entry.clone())?;
        let hmr = Object::new(ctx.clone())?;
        hmr.set("url", manifest.hmr_url.clone())?;
        dev_manifest.set("hmr", hmr)?;
        dev_manifest.set("rpc", manifest.rpc_url.clone())?;
        ctx.globals()
            .set("__eclipsaNativeDevManifest", dev_manifest)?;

        let runtime_object = Object::new(ctx.clone())?;
        let rpc_url = manifest.rpc_url.clone();
        runtime_object.set(
            "invoke",
            Func::from(move |name: String, payload_json: String| -> String {
                match invoke_native_dev_rpc(&rpc_url, &name, &payload_json) {
                    Ok(result) => result,
                    Err(error) => json!({
                        "error": {
                            "message": error.to_string(),
                        }
                    })
                    .to_string(),
                }
            }),
        )?;

        let dev_state = Rc::clone(&self.dev_state);
        let hmr_url = manifest.hmr_url.clone();
        runtime_object.set(
            "connectHMR",
            Func::from(move |callback: Persistent<Function<'static>>| {
                {
                    let mut dev_state = dev_state.borrow_mut();
                    dev_state.hmr_callback = Some(callback);
                }

                let should_connect = dev_state.borrow().receiver.is_none();
                if should_connect {
                    let stop_hmr = Arc::new(AtomicBool::new(false));
                    match spawn_hmr_receiver(&hmr_url, Arc::clone(&stop_hmr)) {
                        Ok(spawned) => {
                            let connected = spawned.wait_for_initial_ready(INITIAL_HMR_READY_TIMEOUT);
                            let SpawnedHmrReceiver { receiver, .. } = spawned;
                            let mut dev_state = dev_state.borrow_mut();
                            dev_state.receiver = Some(receiver);
                            dev_state.stop_hmr = Some(stop_hmr);
                            if !connected {
                                eprintln!(
                                    "The native GTK 4 host timed out waiting for the initial HMR connection."
                                );
                            }
                        }
                        Err(error) => {
                            eprintln!("Failed to connect native HMR: {error}");
                        }
                    }
                }
            }),
        )?;

        ctx.globals()
            .set("__eclipsaNativeRuntime", runtime_object)?;
        Ok(())
    }

    fn run_pending_jobs(&self, ctx: Ctx<'_>) -> Result<()> {
        loop {
            if !ctx.execute_pending_job() {
                break;
            }
        }
        Ok(())
    }
}

impl Drop for EclipsaGtk4Host {
    fn drop(&mut self) {
        if let Ok(mut dev_state) = self.dev_state.try_borrow_mut() {
            if let Some(stop_hmr) = dev_state.stop_hmr.take() {
                stop_hmr.store(true, Ordering::Relaxed);
            }
            dev_state.hmr_callback = None;
            dev_state.receiver = None;
        }
        if let Ok(mut event_handlers) = self.event_handlers.try_borrow_mut() {
            event_handlers.clear();
        }
    }
}

fn invoke_native_dev_rpc(rpc_url: &str, name: &str, payload_json: &str) -> Result<String> {
    let payload = if payload_json.trim().is_empty() {
        serde_json::Value::Array(Vec::new())
    } else {
        serde_json::from_str(payload_json)
            .with_context(|| format!("Invalid JSON payload for native RPC {name}."))?
    };
    let response = ureq::post(rpc_url)
        .content_type("application/json; charset=utf-8")
        .send_json(json!({
            "data": payload,
            "name": name,
        }))?;
    let mut body = response.into_body();
    Ok(body.read_to_string()?)
}

fn signal_initial_ready(initial_ready: &Sender<()>, did_signal_ready: &mut bool) {
    if *did_signal_ready {
        return;
    }
    *did_signal_ready = true;
    let _ = initial_ready.send(());
}

fn create_hmr_request(hmr_url: &str) -> Result<WebSocketRequest> {
    let mut request = hmr_url.into_client_request()?;
    request.headers_mut().insert(
        "Sec-WebSocket-Protocol",
        HeaderValue::from_static("vite-hmr"),
    );
    Ok(request)
}

fn spawn_hmr_receiver(hmr_url: &str, stop_hmr: Arc<AtomicBool>) -> Result<SpawnedHmrReceiver> {
    create_hmr_request(hmr_url)?;
    let (initial_ready_tx, initial_ready_rx) = mpsc::channel();
    let (sender, receiver) = mpsc::channel();
    let hmr_url = hmr_url.to_owned();

    thread::spawn(move || {
        let mut did_signal_ready = false;

        while !stop_hmr.load(Ordering::Relaxed) {
            let request = match create_hmr_request(&hmr_url) {
                Ok(request) => request,
                Err(error) => {
                    eprintln!("Failed to connect native HMR: {error}");
                    break;
                }
            };

            let (mut socket, _) = match connect(request) {
                Ok(connection) => connection,
                Err(error) => {
                    if !stop_hmr.load(Ordering::Relaxed) {
                        eprintln!("Failed to connect native HMR: {error}");
                        thread::sleep(Duration::from_millis(250));
                    }
                    continue;
                }
            };

            loop {
                if stop_hmr.load(Ordering::Relaxed) {
                    let _ = socket.close(None);
                    return;
                }

                match socket.read() {
                    Ok(Message::Text(message)) => {
                        signal_initial_ready(&initial_ready_tx, &mut did_signal_ready);
                        if sender.send(message.to_string()).is_err() {
                            return;
                        }
                    }
                    Ok(Message::Binary(bytes)) => {
                        let Ok(message) = String::from_utf8(bytes.to_vec()) else {
                            continue;
                        };
                        signal_initial_ready(&initial_ready_tx, &mut did_signal_ready);
                        if sender.send(message).is_err() {
                            return;
                        }
                    }
                    Ok(Message::Ping(payload)) => {
                        if socket.send(Message::Pong(payload)).is_err() {
                            break;
                        }
                    }
                    Ok(Message::Pong(_)) | Ok(Message::Frame(_)) => {}
                    Ok(Message::Close(_))
                    | Err(WebSocketError::ConnectionClosed)
                    | Err(WebSocketError::AlreadyClosed) => break,
                    Err(WebSocketError::Io(error))
                        if error.kind() == ErrorKind::WouldBlock
                            || error.kind() == ErrorKind::TimedOut =>
                    {
                        continue;
                    }
                    Err(error) => {
                        if !stop_hmr.load(Ordering::Relaxed) {
                            eprintln!("Native HMR socket error: {error}");
                        }
                        break;
                    }
                }
            }

            if !stop_hmr.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(250));
            }
        }
    });

    Ok(SpawnedHmrReceiver {
        initial_ready: initial_ready_rx,
        receiver,
    })
}

pub fn write_file(path: &Path, value: &str) -> Result<()> {
    fs::write(path, value)?;
    Ok(())
}

#[cfg_attr(not(feature = "gtk-ui"), allow(dead_code))]
pub fn is_dev_manifest_source(value: Option<&str>) -> bool {
    matches!(value, Some(manifest) if manifest.starts_with("http://") || manifest.starts_with("https://"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::loader::NativeApplicationDescriptor;
    use std::net::TcpListener;
    use tungstenite::{
        accept_hdr,
        handshake::server::{Request, Response},
        Message,
    };

    struct TestLoader {
        descriptor: NativeApplicationDescriptor,
    }

    impl BootstrapScriptLoading for TestLoader {
        fn load(&self) -> Result<NativeApplicationDescriptor> {
            Ok(self.descriptor.clone())
        }
    }

    fn create_test_host(source: &str) -> EclipsaGtk4Host {
        EclipsaGtk4Host::with_loader(TestLoader {
            descriptor: NativeApplicationDescriptor::Script(BootstrapScript {
                origin: "inline-test.js".to_owned(),
                source: source.to_owned(),
            }),
        })
        .expect("create test GTK host")
    }

    #[test]
    fn hmr_receiver_relays_messages_after_the_initial_ready_event() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test websocket listener");
        let address = listener.local_addr().expect("read local websocket address");
        let ws_url = format!("ws://{address}/");

        let server = thread::spawn(move || {
            let (stream, _) = listener.accept().expect("accept websocket client");
            let callback = |request: &Request, mut response: Response| {
                if let Some(protocol) = request.headers().get("Sec-WebSocket-Protocol") {
                    response
                        .headers_mut()
                        .insert("Sec-WebSocket-Protocol", protocol.clone());
                }
                Ok(response)
            };
            let mut socket = accept_hdr(stream, callback).expect("upgrade websocket client");
            socket
                .send(Message::Text("{\"type\":\"connected\"}".into()))
                .expect("send connected payload");
            socket
                .send(Message::Text("{\"type\":\"update\",\"updates\":[]}".into()))
                .expect("send update payload");
        });

        let stop_hmr = Arc::new(AtomicBool::new(false));
        let spawned =
            spawn_hmr_receiver(&ws_url, Arc::clone(&stop_hmr)).expect("spawn hmr receiver");

        assert!(spawned.wait_for_initial_ready(Duration::from_secs(2)));
        assert_eq!(
            spawned
                .receiver
                .recv_timeout(Duration::from_secs(2))
                .expect("receive connected payload"),
            "{\"type\":\"connected\"}"
        );
        assert_eq!(
            spawned
                .receiver
                .recv_timeout(Duration::from_secs(2))
                .expect("receive update payload"),
            "{\"type\":\"update\",\"updates\":[]}"
        );

        stop_hmr.store(true, Ordering::Relaxed);
        server.join().expect("join websocket server");
    }

    #[test]
    fn detects_http_manifests_as_dev_sources() {
        assert!(is_dev_manifest_source(Some(
            "http://127.0.0.1:5179/__eclipsa_native__/manifest.json"
        )));
        assert!(is_dev_manifest_source(Some(
            "https://example.test/manifest.json"
        )));
        assert!(!is_dev_manifest_source(Some("/tmp/eclipsa/manifest.json")));
        assert!(!is_dev_manifest_source(None));
    }

    #[test]
    fn applies_ui_actions_without_calling_dispatch_from_the_widget_callback() {
        let mut host = create_test_host(
            r#"
            const renderer = globalThis.__eclipsaNative.renderer
            const events = globalThis.__eclipsaNative.events
            const root = renderer.createElement("gtk4:window")
            const status = renderer.createElement("gtk4:text")
            renderer.setProp(status, "value", "idle")
            renderer.insert(root, status, null)

            const button = renderer.createElement("gtk4:button")
            renderer.setProp(button, "title", "Click")
            events.on(button, "click", () => {
              renderer.setProp(status, "value", "clicked")
              renderer.publish(root)
            })
            renderer.insert(root, button, null)

            const input = renderer.createElement("gtk4:text-field")
            renderer.setProp(input, "value", "GTK")
            events.on(input, "input", (value) => {
              renderer.setProp(status, "value", `input:${value}`)
              renderer.publish(root)
            })
            renderer.insert(root, input, null)

            const toggle = renderer.createElement("gtk4:switch")
            renderer.setProp(toggle, "value", true)
            events.on(toggle, "toggle", (value) => {
              renderer.setProp(status, "value", value ? "enabled" : "disabled")
              renderer.publish(root)
            })
            renderer.insert(root, toggle, null)

            renderer.publish(root)
            "#,
        );

        host.boot().expect("boot test host");
        host.apply_ui_action(HostUiAction::Click {
            node_id: "gtk4-node-3".to_owned(),
        })
        .expect("apply click action");
        assert_eq!(
            host.root()
                .expect("rendered root after click")
                .children
                .first()
                .and_then(|node| node.string_prop("value")),
            Some("clicked")
        );

        host.apply_ui_action(HostUiAction::Input {
            node_id: "gtk4-node-4".to_owned(),
            value: "GTK 4".to_owned(),
        })
        .expect("apply input action");
        assert_eq!(
            host.root()
                .expect("rendered root after input")
                .children
                .first()
                .and_then(|node| node.string_prop("value")),
            Some("input:GTK 4")
        );

        host.apply_ui_action(HostUiAction::Toggle {
            node_id: "gtk4-node-5".to_owned(),
            value: false,
        })
        .expect("apply toggle action");
        assert_eq!(
            host.root()
                .expect("rendered root after toggle")
                .children
                .first()
                .and_then(|node| node.string_prop("value")),
            Some("disabled")
        );
    }

    #[test]
    fn repeated_click_actions_keep_publishing_updates() {
        let mut host = create_test_host(
            r#"
            const renderer = globalThis.__eclipsaNative.renderer
            const events = globalThis.__eclipsaNative.events
            let count = 0

            const root = renderer.createElement("gtk4:window")
            const status = renderer.createElement("gtk4:text")
            renderer.setProp(status, "value", "count:0")
            renderer.insert(root, status, null)

            const button = renderer.createElement("gtk4:button")
            renderer.setProp(button, "title", "Count")
            events.on(button, "click", () => {
              count += 1
              renderer.setProp(status, "value", `count:${count}`)
              renderer.publish(root)
            })
            renderer.insert(root, button, null)
            renderer.publish(root)
            "#,
        );

        host.boot().expect("boot test host");

        for expected in ["count:1", "count:2"] {
            host.apply_ui_action(HostUiAction::Click {
                node_id: "gtk4-node-3".to_owned(),
            })
            .expect("apply repeated click action");
            assert_eq!(
                host.root()
                    .expect("rendered root after repeated click")
                    .children
                    .first()
                    .and_then(|node| node.string_prop("value")),
                Some(expected)
            );
            assert!(host.take_render_update());
        }
    }

    #[test]
    fn pump_only_requests_a_refresh_when_the_tree_was_published() {
        let mut host = create_test_host(
            r#"
            const renderer = globalThis.__eclipsaNative.renderer
            const root = renderer.createElement("gtk4:window")
            const status = renderer.createElement("gtk4:text")
            renderer.setProp(status, "value", "idle")
            renderer.insert(root, status, null)
            renderer.publish(root)
            "#,
        );

        host.boot().expect("boot test host");
        assert!(host.take_render_update());
        let result = host
            .pump(std::iter::empty::<HostUiAction>())
            .expect("pump without actions");
        assert!(
            !result.needs_refresh,
            "pump without actions should not request a refresh"
        );
        assert!(!result.requires_full_rebuild);

        let (sender, receiver) = mpsc::channel();
        sender
            .send("{\"type\":\"connected\"}".to_owned())
            .expect("send connected payload");
        let callback = host
            .context
            .with(|ctx| -> Result<Persistent<Function<'static>>> {
                let function = ctx.eval::<Function<'_>, _>("(message) => { void message }")?;
                Ok(Persistent::save(&ctx, function))
            })
            .expect("create persistent hmr callback");
        {
            let mut dev_state = host.dev_state.borrow_mut();
            dev_state.hmr_callback = Some(callback);
            dev_state.receiver = Some(receiver);
        }

        let result = host
            .pump(std::iter::empty::<HostUiAction>())
            .expect("pump hmr without publish");
        assert!(!result.needs_refresh);
        assert!(!result.requires_full_rebuild);
    }

    #[test]
    fn pump_marks_hmr_publishes_for_full_rebuild() {
        let mut host = create_test_host(
            r#"
            const renderer = globalThis.__eclipsaNative.renderer
            const root = renderer.createElement("gtk4:window")
            const status = renderer.createElement("gtk4:text")
            renderer.setProp(status, "value", "idle")
            renderer.insert(root, status, null)
            renderer.publish(root)
            globalThis.__testHmrUpdate = () => {
              renderer.setProp(status, "value", "hmr")
              renderer.publish(root)
            }
            "#,
        );

        host.boot().expect("boot test host");
        assert!(host.take_render_update());

        let callback = host
            .context
            .with(|ctx| -> Result<Persistent<Function<'static>>> {
                let function = ctx.eval::<Function<'_>, _>(
                    "(message) => { if (JSON.parse(message).type === \"update\") globalThis.__testHmrUpdate() }",
                )?;
                Ok(Persistent::save(&ctx, function))
            })
            .expect("create persistent hmr callback");
        let (sender, receiver) = mpsc::channel();
        sender
            .send("{\"type\":\"update\",\"updates\":[]}".to_owned())
            .expect("send update payload");
        {
            let mut dev_state = host.dev_state.borrow_mut();
            dev_state.hmr_callback = Some(callback);
            dev_state.receiver = Some(receiver);
        }

        let result = host
            .pump(std::iter::empty::<HostUiAction>())
            .expect("pump hmr publish");
        assert!(result.needs_refresh);
        assert!(result.requires_full_rebuild);
    }
}
