use anyhow::{Context, Result};
use eclipsa_native_gtk4_host::{write_file, EclipsaGtk4Host, EventPayload, NativeNode};
use serde::Serialize;
use std::env;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SmokeOutput {
    final_tree: NativeNode,
    initial_tree: NativeNode,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error:?}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let mut host = EclipsaGtk4Host::new()?;
    host.boot()?;

    let initial_tree = host
        .root()
        .context("GTK 4 host did not publish an initial tree.")?;

    if let Some(ready_file) = env::var_os("ECLIPSA_NATIVE_SMOKE_READY_FILE") {
        write_file(&PathBuf::from(ready_file), "ready")?;
        let wait_seconds = env::var("ECLIPSA_NATIVE_SMOKE_WAIT_FOR_SECONDS")
            .ok()
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or(0.0);
        let deadline = Instant::now() + Duration::from_secs_f64(wait_seconds.max(0.0));
        while Instant::now() < deadline {
            if let Err(error) = host.pump(std::iter::empty()) {
                eprintln!("{error:?}");
            }
            thread::sleep(Duration::from_millis(25));
        }
    } else {
        apply_interactions(&mut host, &initial_tree)?;
    }

    let final_tree = host
        .root()
        .context("GTK 4 host did not publish a final tree.")?;

    let output = SmokeOutput {
        final_tree,
        initial_tree,
    };
    println!("{}", serde_json::to_string(&output)?);
    Ok(())
}

fn apply_interactions(host: &mut EclipsaGtk4Host, root: &NativeNode) -> Result<()> {
    if let Some(button) = find_node(root, |node| node.tag == "gtk4:button") {
        host.dispatch_event(&button.id, "click", None)?;
    }

    if let Some(text_field) = find_node(root, |node| node.tag == "gtk4:text-field") {
        host.update_string(&text_field.id, "value", "GTK 4");
        host.dispatch_event(
            &text_field.id,
            "input",
            Some(EventPayload::String("GTK 4".to_owned())),
        )?;
    }

    if let Some(toggle) = find_node(root, |node| node.tag == "gtk4:switch") {
        host.update_bool(&toggle.id, "value", false);
        host.dispatch_event(&toggle.id, "toggle", Some(EventPayload::Bool(false)))?;
    }

    Ok(())
}

fn find_node<'a>(
    node: &'a NativeNode,
    predicate: impl Fn(&NativeNode) -> bool + Copy,
) -> Option<&'a NativeNode> {
    if predicate(node) {
        return Some(node);
    }
    for child in &node.children {
        if let Some(found) = find_node(child, predicate) {
            return Some(found);
        }
    }
    None
}
