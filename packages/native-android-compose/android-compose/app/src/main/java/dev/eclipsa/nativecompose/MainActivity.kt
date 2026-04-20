package dev.eclipsa.nativecompose

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private const val DEFAULT_MANIFEST_EXTRA_NAME = "manifestUrl"
private const val DEFAULT_MANIFEST_PATH_EXTRA_NAME = "manifestPath"
private const val ANDROID_BRIDGE_NAME = "__eclipsaNativeAndroid"

private data class NativeNode(
  val id: String,
  val tag: String,
  val text: String?,
  val props: Map<String, String>,
  val children: List<NativeNode>,
)

private data class RendererRecord(
  val childIds: MutableList<String> = mutableListOf(),
  val props: MutableMap<String, String> = linkedMapOf(),
  var tag: String,
  var text: String? = null,
)

private data class NativeDevManifest(
  val entry: String,
  val hmrUrl: String,
  val rpcUrl: String,
)

private sealed interface NativeApplicationDescriptor {
  data class Dev(val manifest: NativeDevManifest) : NativeApplicationDescriptor

  data class Script(val origin: String, val source: String) : NativeApplicationDescriptor
}

private class ComposeTreeStore {
  private val lock = Any()
  private val nextId = AtomicLong()
  private val records = linkedMapOf<String, RendererRecord>()
  private val _root = MutableStateFlow<NativeNode?>(null)
  val root: StateFlow<NativeNode?> = _root.asStateFlow()
  private var rootNodeId: String? = null

  fun clear() {
    synchronized(lock) {
      records.clear()
      rootNodeId = null
    }
    _root.value = null
  }

  fun createElement(type: String) =
    synchronized(lock) {
      val nodeId = allocateId()
      records[nodeId] = RendererRecord(tag = type)
      nodeId
    }

  fun createText(value: String) =
    synchronized(lock) {
      val nodeId = allocateId()
      records[nodeId] = RendererRecord(tag = "compose:text", text = value).also {
        it.props["value"] = value
      }
      nodeId
    }

  fun insert(parentId: String, childId: String, beforeId: String?) {
    synchronized(lock) {
      val parent = records[parentId] ?: return
      parent.childIds.remove(childId)
      val beforeIndex = beforeId?.let(parent.childIds::indexOf)?.takeIf { it >= 0 }
      if (beforeIndex != null) {
        parent.childIds.add(beforeIndex, childId)
      } else {
        parent.childIds.add(childId)
      }
    }
  }

  fun remove(parentId: String, childId: String) {
    synchronized(lock) {
      records[parentId]?.childIds?.remove(childId)
      removeRecord(childId)
    }
  }

  fun reorder(parentId: String, childId: String, beforeId: String?) {
    insert(parentId, childId, beforeId)
  }

  fun setProp(nodeId: String, key: String, value: String) {
    synchronized(lock) {
      records[nodeId]?.props?.set(key, value)
      if (key == "value" && records[nodeId]?.tag == "compose:text") {
        records[nodeId]?.text = value
      }
    }
  }

  fun removeProp(nodeId: String, key: String) {
    synchronized(lock) {
      records[nodeId]?.props?.remove(key)
    }
  }

  fun setText(nodeId: String, value: String) {
    synchronized(lock) {
      records[nodeId]?.text = value
      records[nodeId]?.props?.set("value", value)
    }
  }

  fun publish(rootId: String?) {
    val rootNode =
      synchronized(lock) {
        if (!rootId.isNullOrBlank()) {
          rootNodeId = rootId
        }
        rootNodeId?.let(::materialize)
      }
    _root.value = rootNode
  }

  private fun allocateId() = "compose-node-${nextId.incrementAndGet()}"

  private fun materialize(nodeId: String): NativeNode? {
    val record = records[nodeId] ?: return null
    return NativeNode(
      id = nodeId,
      tag = record.tag,
      text = record.text,
      props = record.props.toMap(),
      children = record.childIds.mapNotNull(::materialize),
    )
  }

  private fun removeRecord(nodeId: String) {
    val record = records.remove(nodeId) ?: return
    for (childId in record.childIds) {
      removeRecord(childId)
    }
    if (rootNodeId == nodeId) {
      rootNodeId = null
    }
  }
}

private class AndroidRuntimeBridge(
  private val store: ComposeTreeStore,
  private val invokeRuntime: (String, String) -> String,
) {
  @JavascriptInterface
  fun createElement(type: String): String = store.createElement(type)

  @JavascriptInterface
  fun createText(value: String): String = store.createText(value)

  @JavascriptInterface
  fun insert(parentId: String, childId: String, beforeId: String?) {
    store.insert(parentId, childId, beforeId.nullIfBlank())
  }

  @JavascriptInterface
  fun remove(parentId: String, childId: String) {
    store.remove(parentId, childId)
  }

  @JavascriptInterface
  fun reorder(parentId: String, childId: String, beforeId: String?) {
    store.reorder(parentId, childId, beforeId.nullIfBlank())
  }

  @JavascriptInterface
  fun setProp(nodeId: String, key: String, value: String) {
    store.setProp(nodeId, key, value)
  }

  @JavascriptInterface
  fun removeProp(nodeId: String, key: String) {
    store.removeProp(nodeId, key)
  }

  @JavascriptInterface
  fun setText(nodeId: String, value: String) {
    store.setText(nodeId, value)
  }

  @JavascriptInterface
  fun publish(rootId: String?) {
    store.publish(rootId.nullIfBlank())
  }

  @JavascriptInterface
  fun invoke(name: String, payloadJson: String): String = invokeRuntime(name, payloadJson)
}

@SuppressLint("SetJavaScriptEnabled")
private class EclipsaComposeHostController(private val activity: ComponentActivity) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val webViewReady = CompletableDeferred<Unit>()
  private val store = ComposeTreeStore()
  private val _status = MutableStateFlow<String?>(null)
  val root: StateFlow<NativeNode?> = store.root
  val status: StateFlow<String?> = _status.asStateFlow()
  private var devManifest: NativeDevManifest? = null

  val webView: WebView =
    WebView(activity).apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.allowFileAccess = true
      webChromeClient = WebChromeClient()
      webViewClient =
        object : WebViewClient() {
          override fun onPageFinished(view: WebView?, url: String?) {
            if (!webViewReady.isCompleted) {
              webViewReady.complete(Unit)
            }
          }
        }
      addJavascriptInterface(
        AndroidRuntimeBridge(store) { name, payloadJson ->
          invokeRuntime(name, payloadJson)
        },
        ANDROID_BRIDGE_NAME,
      )
      loadDataWithBaseURL(
        "https://eclipsa.native.host/",
        "<!doctype html><html><body></body></html>",
        "text/html",
        "utf-8",
        null,
      )
    }

  fun boot(manifestUrl: String?, manifestPath: String?) {
    scope.launch {
      store.clear()
      _status.value = null
      try {
        webViewReady.await()
        val descriptor =
          withContext(Dispatchers.IO) {
            loadDescriptor(
              manifestUrl = manifestUrl?.trim().takeUnless { it.isNullOrEmpty() },
              manifestPath = manifestPath?.trim().takeUnless { it.isNullOrEmpty() },
            )
          }
        devManifest = (descriptor as? NativeApplicationDescriptor.Dev)?.manifest
        evaluateJavascript(createBridgePrelude(descriptor))
        when (descriptor) {
          is NativeApplicationDescriptor.Dev ->
            evaluateJavascript(loadAssetSource("vite-runner.js"))

          is NativeApplicationDescriptor.Script ->
            evaluateJavascript(descriptor.source)
        }
        evaluateJavascript("globalThis.__eclipsaBoot?.();")
        if (store.root.value == null) {
          _status.value = "Native bootstrap script did not publish a root node."
        }
      } catch (error: Throwable) {
        _status.value = error.message ?: error.toString()
      }
    }
  }

  fun dispatchEvent(nodeId: String, eventName: String, payload: Any? = null) {
    scope.launch {
      try {
        webViewReady.await()
        evaluateJavascript(
          "globalThis.__eclipsaDispatchEvent(${quoteJsString(nodeId)}, ${quoteJsString(eventName)}, ${encodeJsValue(payload)});",
        )
      } catch (error: Throwable) {
        _status.value = error.message ?: error.toString()
      }
    }
  }

  fun close() {
    scope.cancel()
    webView.removeJavascriptInterface(ANDROID_BRIDGE_NAME)
    webView.destroy()
  }

  private suspend fun loadDescriptor(
    manifestUrl: String?,
    manifestPath: String?,
  ): NativeApplicationDescriptor {
    val location =
      manifestUrl
        ?: manifestPath?.let { File(it).toURI().toString() }
        ?: throw IllegalStateException("$DEFAULT_MANIFEST_EXTRA_NAME extra is not set")
    val manifestSource = readTextFromLocation(location)
    val manifest = JSONObject(manifestSource)
    if (manifest.optString("mode") == "dev") {
      val entry = manifest.optString("entry")
      val rpc = manifest.optString("rpc")
      val hmrUrl = manifest.optJSONObject("hmr")?.optString("url").orEmpty()
      if (entry.isBlank() || rpc.isBlank() || hmrUrl.isBlank()) {
        throw IllegalStateException("The native dev manifest is missing entry, rpc, or hmr.url.")
      }
      return NativeApplicationDescriptor.Dev(
        NativeDevManifest(
          entry = entry,
          hmrUrl = hmrUrl,
          rpcUrl = rpc,
        ),
      )
    }

    val bootstrapLocation = manifest.optString("bootstrap")
    if (bootstrapLocation.isBlank()) {
      throw IllegalStateException("The native manifest does not define a bootstrap bundle.")
    }
    val bootstrapUrl = URL(URL(location), bootstrapLocation).toString()
    return NativeApplicationDescriptor.Script(
      origin = bootstrapUrl,
      source = readTextFromLocation(bootstrapUrl),
    )
  }

  private fun createBridgePrelude(descriptor: NativeApplicationDescriptor): String {
    val devManifestScript =
      when (descriptor) {
        is NativeApplicationDescriptor.Dev -> {
          val manifestJson =
            JSONObject()
              .put("entry", descriptor.manifest.entry)
              .put("hmr", JSONObject().put("url", descriptor.manifest.hmrUrl))
              .put("rpc", descriptor.manifest.rpcUrl)
              .toString()
          """
          globalThis.__eclipsaNativeDevManifest = $manifestJson;
          globalThis.__eclipsaNativeRuntime = {
            invoke(name, payloadJSON) {
              return $ANDROID_BRIDGE_NAME.invoke(String(name), String(payloadJSON ?? "[]"));
            },
            connectHMR(callback) {
              const manifest = globalThis.__eclipsaNativeDevManifest;
              if (!manifest?.hmr?.url || typeof callback !== "function") {
                return;
              }
              const socket = new WebSocket(manifest.hmr.url, ["vite-hmr"]);
              socket.onmessage = (event) => {
                callback(typeof event.data === "string" ? event.data : String(event.data ?? ""));
              };
              socket.onerror = (event) => {
                console.error("EclipsaNative HMR socket error", event);
              };
              globalThis.__eclipsaNativeHmrSocket = socket;
            },
          };
          """.trimIndent()
        }

        is NativeApplicationDescriptor.Script -> ""
      }

    return """
      (() => {
        const bridge = globalThis.$ANDROID_BRIDGE_NAME;
        const eventHandlers = new Map();
        const normalizeOptional = (value) => value == null ? "" : String(value);
        const serializePropValue = (value) => {
          if (value == null) {
            return null;
          }
          if (typeof value === "string") {
            return value;
          }
          if (typeof value === "boolean" || typeof value === "number") {
            return String(value);
          }
          try {
            return JSON.stringify(value);
          } catch (_error) {
            return String(value);
          }
        };

        globalThis.__eclipsaDispatchEvent = (nodeID, eventName, payload) => {
          const handler = eventHandlers.get(`${'$'}{String(nodeID)}::${'$'}{String(eventName)}`);
          if (typeof handler !== "function") {
            return false;
          }
          handler(payload);
          return true;
        };

        globalThis.__eclipsaNative = {
          renderer: {
            createElement(type) {
              return bridge.createElement(String(type));
            },
            createText(value) {
              return bridge.createText(String(value ?? ""));
            },
            insert(parentID, childID, beforeID) {
              bridge.insert(String(parentID), String(childID), normalizeOptional(beforeID));
            },
            remove(parentID, childID) {
              bridge.remove(String(parentID), String(childID));
            },
            reorder(parentID, childID, beforeID) {
              bridge.reorder(String(parentID), String(childID), normalizeOptional(beforeID));
            },
            removeProp(nodeID, key) {
              bridge.removeProp(String(nodeID), String(key));
            },
            setProp(nodeID, key, value) {
              const serialized = serializePropValue(value);
              if (serialized == null) {
                bridge.removeProp(String(nodeID), String(key));
                return;
              }
              bridge.setProp(String(nodeID), String(key), serialized);
            },
            setText(nodeID, value) {
              bridge.setText(String(nodeID), String(value ?? ""));
            },
            publish(rootID) {
              bridge.publish(normalizeOptional(rootID));
            },
          },
          events: {
            on(nodeID, eventName, listener) {
              eventHandlers.set(`${'$'}{String(nodeID)}::${'$'}{String(eventName)}`, listener);
            },
          },
        };

        $devManifestScript
      })();
    """.trimIndent()
  }

  private suspend fun evaluateJavascript(source: String): String =
    withContext(Dispatchers.Main.immediate) {
      val result = CompletableDeferred<String>()
      webView.evaluateJavascript(source, ValueCallback { value ->
        result.complete(value ?: "null")
      })
      result.await()
    }

  private suspend fun loadAssetSource(name: String) =
    withContext(Dispatchers.IO) {
      activity.assets.open(name).bufferedReader().use { it.readText() }
    }

  private fun invokeRuntime(name: String, payloadJson: String): String {
    val manifest = devManifest
      ?: return errorResponse("Native runtime bridge is unavailable before the dev manifest loads.")
    return try {
      val payload =
        JSONObject()
          .put("name", name)
          .put("data", JSONArray(payloadJson))
          .toString()
      postJson(manifest.rpcUrl, payload)
    } catch (error: Throwable) {
      errorResponse(error.message ?: error.toString())
    }
  }
}

class MainActivity : ComponentActivity() {
  private lateinit var controller: EclipsaComposeHostController

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    controller = EclipsaComposeHostController(this)

    val manifestUrl = intent?.getStringExtra(DEFAULT_MANIFEST_EXTRA_NAME)
    val manifestPath = intent?.getStringExtra(DEFAULT_MANIFEST_PATH_EXTRA_NAME)

    setContent {
      MaterialTheme {
        NativeComposeHostScreen(
          controller = controller,
          manifestUrl = manifestUrl,
          manifestPath = manifestPath,
        )
      }
    }
  }

  override fun onDestroy() {
    controller.close()
    super.onDestroy()
  }
}

@Composable
private fun NativeComposeHostScreen(
  controller: EclipsaComposeHostController,
  manifestUrl: String?,
  manifestPath: String?,
) {
  val root by controller.root.collectAsState()
  val status by controller.status.collectAsState()

  LaunchedEffect(manifestUrl, manifestPath) {
    controller.boot(manifestUrl, manifestPath)
  }

  Surface(modifier = Modifier.fillMaxSize()) {
    Box(modifier = Modifier.fillMaxSize()) {
      AndroidView(
        factory = { controller.webView },
        modifier = Modifier.size(0.dp),
      )

      when {
        root != null -> RenderNativeNode(node = root!!, controller = controller)
        status != null -> ErrorScreen(message = status!!)
        else -> LoadingScreen()
      }
    }
  }
}

@Composable
private fun LoadingScreen() {
  Box(
    modifier = Modifier.fillMaxSize(),
    contentAlignment = Alignment.Center,
  ) {
    Column(
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      CircularProgressIndicator()
      Text("Booting Eclipsa Native Compose…")
    }
  }
}

@Composable
private fun ErrorScreen(message: String) {
  Scaffold { padding ->
    Column(
      modifier =
        Modifier
          .fillMaxSize()
          .padding(padding)
          .padding(24.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text("Eclipsa Native Compose")
      Text(message)
    }
  }
}

@Composable
private fun RenderNativeNode(
  node: NativeNode,
  controller: EclipsaComposeHostController,
  modifier: Modifier = Modifier,
) {
  when (node.tag) {
    "compose:activity" ->
      Scaffold { padding ->
        Column(
          modifier =
            modifier
              .fillMaxSize()
              .padding(padding),
        ) {
          node.children.forEach { child ->
            RenderNativeNode(node = child, controller = controller)
          }
        }
      }

    "compose:column" ->
      Column(
        modifier = modifier.fillMaxSize().padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(node.props.dp("spacing")),
      ) {
        node.children.forEach { child ->
          RenderNativeNode(node = child, controller = controller)
        }
      }

    "compose:row" ->
      Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(node.props.dp("spacing")),
      ) {
        node.children.forEach { child ->
          RenderNativeNode(node = child, controller = controller)
        }
      }

    "compose:lazy-column" ->
      LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(node.props.dp("spacing")),
      ) {
        items(node.children, key = { it.id }) { child ->
          RenderNativeNode(node = child, controller = controller)
        }
      }

    "compose:text" ->
      Text(node.textValue())

    "compose:button" ->
      Button(
        onClick = { controller.dispatchEvent(node.id, "click") },
      ) {
        Text(node.props["title"] ?: node.props["value"] ?: "Button")
      }

    "compose:text-field" ->
      OutlinedTextField(
        value = node.props["value"].orEmpty(),
        onValueChange = { controller.dispatchEvent(node.id, "valueChange", it) },
        label = {
          val placeholder = node.props["placeholder"]
          if (!placeholder.isNullOrBlank()) {
            Text(placeholder)
          }
        },
      )

    "compose:switch" -> {
      val title = node.props["title"]
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        if (!title.isNullOrBlank()) {
          Text(title)
        }
        Switch(
          checked = node.props.boolean("value"),
          onCheckedChange = { controller.dispatchEvent(node.id, "checkedChange", it) },
        )
      }
    }

    "compose:spacer" ->
      Spacer(
        modifier =
          modifier
            .width(node.props.dp("width", fallback = node.props.dp("size")))
            .height(node.props.dp("height", fallback = node.props.dp("size"))),
      )

    else ->
      Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        if (node.textValue().isNotBlank()) {
          Text(node.textValue())
        }
        node.children.forEach { child ->
          RenderNativeNode(node = child, controller = controller)
        }
      }
  }
}

private fun readTextFromLocation(location: String): String {
  val url = URL(location)
  val connection = url.openConnection().apply {
    connectTimeout = 10_000
    readTimeout = 30_000
    if (this is HttpURLConnection) {
      requestMethod = "GET"
      setRequestProperty("Accept", "application/json, text/javascript, */*")
    }
  }
  return connection.getInputStream().bufferedReader().use { it.readText() }
}

private fun postJson(url: String, body: String): String {
  val connection = (URL(url).openConnection() as HttpURLConnection).apply {
    connectTimeout = 10_000
    readTimeout = 30_000
    doOutput = true
    requestMethod = "POST"
    setRequestProperty("Content-Type", "application/json; charset=utf-8")
  }
  connection.outputStream.bufferedWriter().use { it.write(body) }
  val stream =
    if (connection.responseCode in 200..299) {
      connection.inputStream
    } else {
      connection.errorStream ?: throw IllegalStateException("Native dev RPC failed with ${connection.responseCode}.")
    }
  return stream.bufferedReader().use { it.readText() }
}

private fun errorResponse(message: String) =
  JSONObject().put("error", JSONObject().put("message", message)).toString()

private fun quoteJsString(value: String) = JSONObject.quote(value)

private fun encodeJsValue(value: Any?): String =
  when (value) {
    null -> "null"
    is Boolean, is Number -> value.toString()
    is String -> JSONObject.quote(value)
    else -> JSONObject.wrap(value)?.toString() ?: "null"
  }

private fun String?.nullIfBlank(): String? = this?.takeUnless { it.isBlank() }

private fun Map<String, String>.boolean(key: String) =
  this[key]?.equals("true", ignoreCase = true) == true

private fun Map<String, String>.dp(key: String, fallback: Dp = 0.dp) =
  this[key]?.toFloatOrNull()?.dp ?: fallback

private fun NativeNode.textValue() = props["value"] ?: text.orEmpty()
