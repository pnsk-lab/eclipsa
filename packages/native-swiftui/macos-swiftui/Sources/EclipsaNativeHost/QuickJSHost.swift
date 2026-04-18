import Combine
import Foundation
import JavaScriptCore
import SwiftUI

public protocol QuickJSRuntime {
  func boot(renderer: SwiftUIRendererBridge) async throws
  func dispatchEvent(nodeID: String, eventName: String, payload: Any?) async throws
}

public struct BootstrapScript {
  public let origin: String
  public let source: String

  public init(origin: String, source: String) {
    self.origin = origin
    self.source = source
  }
}

public struct NativeDevManifest {
  public let entry: String
  public let hmrURL: String
  public let rpcURL: String

  public init(entry: String, hmrURL: String, rpcURL: String) {
    self.entry = entry
    self.hmrURL = hmrURL
    self.rpcURL = rpcURL
  }
}

public enum NativeApplicationDescriptor {
  case script(BootstrapScript)
  case dev(NativeDevManifest)
}

public protocol BootstrapScriptLoading {
  func load() throws -> NativeApplicationDescriptor
}

private struct NativeBundleManifest: Decodable {
  struct HMRManifest: Decodable {
    let url: String
  }

  let bootstrap: String?
  let entry: String?
  let hmr: HMRManifest?
  let mode: String?
  let rpc: String?
}

public enum QuickJSHostError: LocalizedError {
  case missingBootstrapConfiguration
  case invalidBootstrapManifest(String)
  case invalidBootstrapScriptPath(String)
  case javaScriptContextUnavailable
  case javaScriptException(String)
  case missingEventHandler(nodeID: String, eventName: String)
  case missingNativeDevRuntimeResource
  case nativeDevRPCFailure(String)

  public var errorDescription: String? {
    switch self {
    case .missingBootstrapConfiguration:
      return "Set ECLIPSA_NATIVE_MANIFEST before booting the native host."
    case .invalidBootstrapManifest(let path):
      return "Failed to load native bundle manifest at \(path)."
    case .invalidBootstrapScriptPath(let path):
      return "Failed to load native bootstrap script at \(path)."
    case .javaScriptContextUnavailable:
      return "Failed to create the embedded JavaScript runtime."
    case .javaScriptException(let message):
      return message
    case .missingEventHandler(let nodeID, let eventName):
      return "No event handler is registered for \(nodeID)#\(eventName)."
    case .missingNativeDevRuntimeResource:
      return "The native dev runtime resource is missing."
    case .nativeDevRPCFailure(let message):
      return message
    }
  }
}

public struct DefaultBootstrapScriptLoader: BootstrapScriptLoading {
  public let environment: [String: String]
  public let fileManager: FileManager

  public init(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default,
  ) {
    self.environment = environment
    self.fileManager = fileManager
  }

  public func load() throws -> NativeApplicationDescriptor {
    if let manifestLocation = environment["ECLIPSA_NATIVE_MANIFEST"], !manifestLocation.isEmpty {
      return try loadFromManifest(location: manifestLocation)
    }

    throw QuickJSHostError.missingBootstrapConfiguration
  }

  private func loadFromManifest(location: String) throws -> NativeApplicationDescriptor {
    let manifestURL = try resolveURL(for: location, kind: .invalidBootstrapManifest)
    let data = try Data(contentsOf: manifestURL)
    let manifest = try JSONDecoder().decode(NativeBundleManifest.self, from: data)

    if manifest.mode == "dev" {
      guard
        let entry = manifest.entry,
        let rpc = manifest.rpc,
        let hmrURL = manifest.hmr?.url
      else {
        throw QuickJSHostError.invalidBootstrapManifest(location)
      }
      return .dev(NativeDevManifest(entry: entry, hmrURL: hmrURL, rpcURL: rpc))
    }

    guard let bootstrap = manifest.bootstrap else {
      throw QuickJSHostError.invalidBootstrapManifest(location)
    }
    let bootstrapURL = URL(string: bootstrap, relativeTo: manifestURL.deletingLastPathComponent())?
      .absoluteURL
    guard let bootstrapURL else {
      throw QuickJSHostError.invalidBootstrapManifest(location)
    }
    return .script(try loadScript(at: bootstrapURL.absoluteString))
  }

  private func loadScript(at location: String) throws -> BootstrapScript {
    let url = try resolveURL(for: location, kind: .invalidBootstrapScriptPath)
    let source = try String(contentsOf: url, encoding: .utf8)
    return BootstrapScript(origin: url.absoluteString, source: source)
  }

  private enum FailureKind {
    case invalidBootstrapManifest
    case invalidBootstrapScriptPath
  }

  private func resolveURL(for location: String, kind: FailureKind) throws -> URL {
    if let remoteURL = URL(string: location), let scheme = remoteURL.scheme, !scheme.isEmpty {
      return remoteURL
    }

    let expandedPath = NSString(string: location).expandingTildeInPath
    guard fileManager.fileExists(atPath: expandedPath) else {
      switch kind {
      case .invalidBootstrapManifest:
        throw QuickJSHostError.invalidBootstrapManifest(expandedPath)
      case .invalidBootstrapScriptPath:
        throw QuickJSHostError.invalidBootstrapScriptPath(expandedPath)
      }
    }
    return URL(fileURLWithPath: expandedPath)
  }
}

private struct EventHandlerKey: Hashable {
  let eventName: String
  let nodeID: String
}

private final class NativeDevRuntimeSession: NSObject {
  private let hmrPingInterval: TimeInterval = 20
  private let manifest: NativeDevManifest
  private lazy var urlSession: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = .greatestFiniteMagnitude
    configuration.timeoutIntervalForResource = .greatestFiniteMagnitude
    return URLSession(configuration: configuration)
  }()
  private var hmrCallback: JSValue?
  private var pingTimer: Timer?
  private var webSocketTask: URLSessionWebSocketTask?

  init(manifest: NativeDevManifest) {
    self.manifest = manifest
  }

  deinit {
    close()
  }

  func close() {
    pingTimer?.invalidate()
    pingTimer = nil
    webSocketTask?.cancel(with: .goingAway, reason: nil)
    webSocketTask = nil
    hmrCallback = nil
  }

  func invoke(name: String, payloadJSON: String) throws -> String {
    guard let rpcURL = URL(string: manifest.rpcURL) else {
      throw QuickJSHostError.nativeDevRPCFailure("Invalid native dev RPC URL: \(manifest.rpcURL)")
    }

    let payloadData = payloadJSON.data(using: .utf8) ?? Data("[]".utf8)
    let payloadObject = (try? JSONSerialization.jsonObject(with: payloadData)) ?? []
    let bodyData = try JSONSerialization.data(withJSONObject: [
      "name": name,
      "data": payloadObject,
    ])

    var request = URLRequest(url: rpcURL)
    request.httpMethod = "POST"
    request.httpBody = bodyData
    request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")

    let responseData = try performSynchronousRequest(request)
    guard let responseText = String(data: responseData, encoding: .utf8) else {
      throw QuickJSHostError.nativeDevRPCFailure("Native dev RPC returned non-UTF-8 data.")
    }
    return responseText
  }

  func connectHMR(callback: JSValue) {
    guard webSocketTask == nil, let url = URL(string: manifest.hmrURL) else {
      return
    }

    hmrCallback = callback
    let task = urlSession.webSocketTask(with: url, protocols: ["vite-hmr"])
    webSocketTask = task
    task.resume()
    startPingLoop()
    receiveNextHMRMessage()
  }

  private func performSynchronousRequest(_ request: URLRequest) throws -> Data {
    let semaphore = DispatchSemaphore(value: 0)
    var result: Result<Data, Error>?

    urlSession.dataTask(with: request) { data, response, error in
      defer { semaphore.signal() }

      if let error {
        result = .failure(error)
        return
      }

      guard let httpResponse = response as? HTTPURLResponse, let data else {
        result = .failure(
          QuickJSHostError.nativeDevRPCFailure("Native dev RPC returned an invalid response.")
        )
        return
      }

      guard (200..<300).contains(httpResponse.statusCode) else {
        let message = String(data: data, encoding: .utf8) ?? "HTTP \(httpResponse.statusCode)"
        result = .failure(QuickJSHostError.nativeDevRPCFailure(message))
        return
      }

      result = .success(data)
    }.resume()

    semaphore.wait()
    return try result?.get()
      ?? {
        throw QuickJSHostError.nativeDevRPCFailure("Native dev RPC completed without a result.")
      }()
  }

  private func receiveNextHMRMessage() {
    webSocketTask?.receive { [weak self] result in
      guard let self else {
        return
      }

      switch result {
      case .success(.data(let data)):
        let message = String(data: data, encoding: .utf8) ?? ""
        Task { @MainActor in
          self.hmrCallback?.call(withArguments: [message])
        }
        self.receiveNextHMRMessage()
      case .success(.string(let message)):
        Task { @MainActor in
          self.hmrCallback?.call(withArguments: [message])
        }
        self.receiveNextHMRMessage()
      case .failure(let error):
        NSLog("EclipsaNative HMR socket closed: %@", error.localizedDescription)
        self.pingTimer?.invalidate()
        self.pingTimer = nil
        self.webSocketTask = nil
      @unknown default:
        self.pingTimer?.invalidate()
        self.pingTimer = nil
        self.webSocketTask = nil
      }
    }
  }

  private func startPingLoop() {
    pingTimer?.invalidate()
    pingTimer = Timer.scheduledTimer(withTimeInterval: hmrPingInterval, repeats: true) {
      [weak self] _ in
      self?.webSocketTask?.sendPing { error in
        if let error {
          NSLog("EclipsaNative HMR ping failed: %@", error.localizedDescription)
        }
      }
    }
  }
}

public final class JavaScriptCoreRuntime: NSObject, QuickJSRuntime {
  private let loader: BootstrapScriptLoading

  private var context: JSContext?
  private var devSession: NativeDevRuntimeSession?
  private weak var renderer: SwiftUIRendererBridge?
  private var eventHandlers: [EventHandlerKey: JSValue] = [:]

  public init(loader: BootstrapScriptLoading = DefaultBootstrapScriptLoader()) {
    self.loader = loader
  }

  @MainActor
  public func boot(renderer: SwiftUIRendererBridge) async throws {
    let descriptor = try loader.load()
    let context = try makeContext(renderer: renderer)

    self.renderer = renderer
    self.context = context
    self.eventHandlers = [:]
    self.devSession?.close()
    self.devSession = nil

    switch descriptor {
    case .script(let bootstrap):
      try evaluateBootstrapScript(bootstrap, in: context)
    case .dev(let manifest):
      try evaluateNativeDevRuntime(manifest, in: context)
    }
  }

  @MainActor
  public func dispatchEvent(nodeID: String, eventName: String, payload: Any?) async throws {
    guard let context else {
      throw QuickJSHostError.javaScriptContextUnavailable
    }
    let handlerKey = EventHandlerKey(eventName: eventName, nodeID: nodeID)
    guard let handler = eventHandlers[handlerKey] else {
      throw QuickJSHostError.missingEventHandler(nodeID: nodeID, eventName: eventName)
    }
    let arguments = payload.map { [$0] } ?? []
    handler.call(withArguments: arguments)
    if let exception = context.exception?.toString() {
      throw QuickJSHostError.javaScriptException(exception)
    }
  }

  @MainActor
  private func makeContext(renderer: SwiftUIRendererBridge) throws -> JSContext {
    guard let context = JSContext() else {
      throw QuickJSHostError.javaScriptContextUnavailable
    }

    context.exceptionHandler = { _, exception in
      if let exception {
        NSLog("EclipsaNative JS exception: %@", exception.toString())
      }
    }

    installConsole(in: context)
    installNativeBridge(in: context, renderer: renderer)
    return context
  }

  @MainActor
  private func evaluateBootstrapScript(_ bootstrap: BootstrapScript, in context: JSContext) throws {
    let sourceURL = URL(string: bootstrap.origin) ?? URL(fileURLWithPath: bootstrap.origin)
    if context.evaluateScript(bootstrap.source, withSourceURL: sourceURL) == nil,
      let exception = context.exception?.toString()
    {
      throw QuickJSHostError.javaScriptException(exception)
    }

    let bootFunction = context.objectForKeyedSubscript("__eclipsaBoot")
    if let bootFunction, !bootFunction.isUndefined, !bootFunction.isNull {
      bootFunction.call(withArguments: [])
      if let exception = context.exception?.toString() {
        throw QuickJSHostError.javaScriptException(exception)
      }
    }
  }

  @MainActor
  private func evaluateNativeDevRuntime(_ manifest: NativeDevManifest, in context: JSContext) throws {
    guard let runtimeURL = Bundle.module.url(forResource: "vite-runner", withExtension: "js") else {
      throw QuickJSHostError.missingNativeDevRuntimeResource
    }

    let session = NativeDevRuntimeSession(manifest: manifest)
    self.devSession = session
    installNativeRuntimeBridge(in: context, manifest: manifest, session: session)

    let source = try String(contentsOf: runtimeURL, encoding: .utf8)
    if context.evaluateScript(source, withSourceURL: runtimeURL) == nil,
      let exception = context.exception?.toString()
    {
      throw QuickJSHostError.javaScriptException(exception)
    }

    let bootFunction = context.objectForKeyedSubscript("__eclipsaBoot")
    if let bootFunction, !bootFunction.isUndefined, !bootFunction.isNull {
      bootFunction.call(withArguments: [])
      if let exception = context.exception?.toString() {
        throw QuickJSHostError.javaScriptException(exception)
      }
    }
  }

  private func installConsole(in context: JSContext) {
    let console = JSValue(newObjectIn: context)

    let logBlock: @convention(block) (JSValue) -> Void = { value in
      NSLog("EclipsaNative JS: %@", value.toString())
    }
    console?.setObject(unsafeBitCast(logBlock, to: AnyObject.self), forKeyedSubscript: "log" as NSString)

    let errorBlock: @convention(block) (JSValue) -> Void = { value in
      NSLog("EclipsaNative JS error: %@", value.toString())
    }
    console?.setObject(
      unsafeBitCast(errorBlock, to: AnyObject.self),
      forKeyedSubscript: "error" as NSString
    )

    context.setObject(console, forKeyedSubscript: "console" as NSString)
  }

  @MainActor
  private func installNativeBridge(in context: JSContext, renderer: SwiftUIRendererBridge) {
    let nativeRoot = JSValue(newObjectIn: context)
    let rendererObject = JSValue(newObjectIn: context)
    let eventsObject = JSValue(newObjectIn: context)

    let createElementBlock: @convention(block) (String) -> String = { type in
      renderer.createElement(type: type)
    }
    rendererObject?.setObject(
      unsafeBitCast(createElementBlock, to: AnyObject.self),
      forKeyedSubscript: "createElement" as NSString
    )

    let createTextBlock: @convention(block) (String) -> String = { value in
      renderer.createText(value: value)
    }
    rendererObject?.setObject(
      unsafeBitCast(createTextBlock, to: AnyObject.self),
      forKeyedSubscript: "createText" as NSString
    )

    let insertBlock: @convention(block) (String, String, JSValue) -> Void = { parentID, childID, beforeID in
      renderer.insert(parentID: parentID, childID: childID, beforeID: Self.optionalString(from: beforeID))
    }
    rendererObject?.setObject(
      unsafeBitCast(insertBlock, to: AnyObject.self),
      forKeyedSubscript: "insert" as NSString
    )

    let removeBlock: @convention(block) (String, String) -> Void = { parentID, childID in
      renderer.remove(parentID: parentID, childID: childID)
    }
    rendererObject?.setObject(
      unsafeBitCast(removeBlock, to: AnyObject.self),
      forKeyedSubscript: "remove" as NSString
    )

    let reorderBlock: @convention(block) (String, String, JSValue) -> Void = { parentID, childID, beforeID in
      renderer.reorder(parentID: parentID, childID: childID, beforeID: Self.optionalString(from: beforeID))
    }
    rendererObject?.setObject(
      unsafeBitCast(reorderBlock, to: AnyObject.self),
      forKeyedSubscript: "reorder" as NSString
    )

    let setPropBlock: @convention(block) (String, String, JSValue) -> Void = { nodeID, key, value in
      if let stringValue = Self.serializedPropValue(from: value) {
        renderer.setProp(nodeID: nodeID, key: key, value: stringValue)
      } else {
        renderer.removeProp(nodeID: nodeID, key: key)
      }
    }
    rendererObject?.setObject(
      unsafeBitCast(setPropBlock, to: AnyObject.self),
      forKeyedSubscript: "setProp" as NSString
    )

    let removePropBlock: @convention(block) (String, String) -> Void = { nodeID, key in
      renderer.removeProp(nodeID: nodeID, key: key)
    }
    rendererObject?.setObject(
      unsafeBitCast(removePropBlock, to: AnyObject.self),
      forKeyedSubscript: "removeProp" as NSString
    )

    let setTextBlock: @convention(block) (String, String) -> Void = { nodeID, value in
      renderer.setText(nodeID: nodeID, value: value)
    }
    rendererObject?.setObject(
      unsafeBitCast(setTextBlock, to: AnyObject.self),
      forKeyedSubscript: "setText" as NSString
    )

    let publishBlock: @convention(block) (JSValue) -> Void = { rootID in
      renderer.publish(rootID: Self.optionalString(from: rootID))
    }
    rendererObject?.setObject(
      unsafeBitCast(publishBlock, to: AnyObject.self),
      forKeyedSubscript: "publish" as NSString
    )

    let onEventBlock: @convention(block) (String, String, JSValue) -> Void = { [weak self] nodeID, eventName, handler in
      guard let self else {
        return
      }
      let key = EventHandlerKey(eventName: eventName, nodeID: nodeID)
      self.eventHandlers[key] = handler
    }
    eventsObject?.setObject(unsafeBitCast(onEventBlock, to: AnyObject.self), forKeyedSubscript: "on" as NSString)

    nativeRoot?.setObject(rendererObject, forKeyedSubscript: "renderer" as NSString)
    nativeRoot?.setObject(eventsObject, forKeyedSubscript: "events" as NSString)
    context.setObject(nativeRoot, forKeyedSubscript: "__eclipsaNative" as NSString)
  }

  @MainActor
  private func installNativeRuntimeBridge(
    in context: JSContext,
    manifest: NativeDevManifest,
    session: NativeDevRuntimeSession,
  ) {
    context.setObject(
      [
        "entry": manifest.entry,
        "hmr": [
          "url": manifest.hmrURL,
        ],
        "rpc": manifest.rpcURL,
      ],
      forKeyedSubscript: "__eclipsaNativeDevManifest" as NSString
    )

    let runtimeObject = JSValue(newObjectIn: context)

    let invokeBlock: @convention(block) (String, String) -> String = { name, payloadJSON in
      do {
        return try session.invoke(name: name, payloadJSON: payloadJSON)
      } catch {
        return "{\"error\":{\"message\":\(String(reflecting: error.localizedDescription))}}"
      }
    }
    runtimeObject?.setObject(
      unsafeBitCast(invokeBlock, to: AnyObject.self),
      forKeyedSubscript: "invoke" as NSString
    )

    let connectHMRBlock: @convention(block) (JSValue) -> Void = { callback in
      session.connectHMR(callback: callback)
    }
    runtimeObject?.setObject(
      unsafeBitCast(connectHMRBlock, to: AnyObject.self),
      forKeyedSubscript: "connectHMR" as NSString
    )

    context.setObject(runtimeObject, forKeyedSubscript: "__eclipsaNativeRuntime" as NSString)
  }

  private static func optionalString(from value: JSValue?) -> String? {
    guard let value, !value.isUndefined, !value.isNull else {
      return nil
    }
    return value.toString()
  }

  private static func serializedPropValue(from value: JSValue) -> String? {
    if value.isUndefined || value.isNull {
      return nil
    }
    if value.isBoolean {
      return value.toBool() ? "true" : "false"
    }
    if value.isString {
      return value.toString()
    }
    if value.isNumber {
      return value.toNumber().stringValue
    }
    if let object = value.toObject() {
      if JSONSerialization.isValidJSONObject(object),
        let data = try? JSONSerialization.data(withJSONObject: object),
        let json = String(data: data, encoding: .utf8)
      {
        return json
      }
      return String(describing: object)
    }
    return value.toString()
  }
}

@MainActor
public final class NativeTreeStore: ObservableObject {
  @Published public var root: NativeNode?

  public init() {}
}

@MainActor
public final class EclipsaHostController: ObservableObject {
  @Published public private(set) var root: NativeNode?

  private let renderer: SwiftUIRendererBridge
  private let runtime: QuickJSRuntime
  private let store = NativeTreeStore()
  private var rootSubscription: AnyCancellable?
  private var booted = false

  public init(runtime: QuickJSRuntime = JavaScriptCoreRuntime()) {
    self.runtime = runtime
    self.renderer = SwiftUIRendererBridge()
    self.renderer.store = store
    self.rootSubscription = store.$root.sink { [weak self] value in
      self?.root = value
    }
  }

  public func bootIfNeeded() async {
    guard !booted else {
      return
    }
    booted = true
    do {
      try await runtime.boot(renderer: renderer)
    } catch {
      renderFallback(error: error.localizedDescription)
      return
    }

    if store.root == nil {
      renderFallback(error: "Native bootstrap script did not publish a root node.")
    }
  }

  public func dispatchEvent(nodeID: String, eventName: String, payload: Any? = nil) {
    Task { @MainActor in
      try? await dispatchEventNow(nodeID: nodeID, eventName: eventName, payload: payload)
    }
  }

  public func dispatchEventNow(nodeID: String, eventName: String, payload: Any? = nil) async throws {
    try await runtime.dispatchEvent(nodeID: nodeID, eventName: eventName, payload: payload)
  }

  public func updateString(nodeID: String, key: String, value: String) {
    renderer.setProp(nodeID: nodeID, key: key, value: value)
    renderer.publish()
  }

  public func updateBool(nodeID: String, key: String, value: Bool) {
    renderer.setProp(nodeID: nodeID, key: key, value: value ? "true" : "false")
    renderer.publish()
  }

  private func renderFallback(error: String?) {
    let root = renderer.createElement(type: "swiftui:vstack")
    let title = renderer.createElement(type: "swiftui:text")
    renderer.setProp(nodeID: title, key: "value", value: "Eclipsa Native SwiftUI")
    renderer.insert(parentID: root, childID: title, beforeID: nil)

    let body = renderer.createElement(type: "swiftui:text")
    renderer.setProp(
      nodeID: body,
      key: "value",
      value: error ?? "The embedded JavaScript runtime failed before rendering."
    )
    renderer.insert(parentID: root, childID: body, beforeID: nil)
    renderer.rootNodeID = root
    renderer.publish()
  }
}
