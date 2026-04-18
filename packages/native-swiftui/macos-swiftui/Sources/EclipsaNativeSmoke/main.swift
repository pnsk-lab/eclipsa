import EclipsaNativeHost
import Foundation

private struct SmokeOutput: Codable {
  let finalTree: NativeNode
  let initialTree: NativeNode
}

private enum SmokeSignals {
  static func signalInitialTreeReady() throws {
    guard
      let path = ProcessInfo.processInfo.environment["ECLIPSA_NATIVE_SMOKE_READY_FILE"],
      !path.isEmpty
    else {
      return
    }

    try Data("ready\n".utf8).write(to: URL(fileURLWithPath: path), options: .atomic)
  }
}

@main
struct EclipsaNativeSmoke {
  static func main() async {
    do {
      let output = try await runSmoke()
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
      let data = try encoder.encode(output)
      FileHandle.standardOutput.write(data)
      FileHandle.standardOutput.write(Data("\n".utf8))
    } catch {
      FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
      Foundation.exit(1)
    }
  }

@MainActor
  private static func runSmoke() async throws -> SmokeOutput {
    if let waitSeconds = ProcessInfo.processInfo.environment["ECLIPSA_NATIVE_SMOKE_WAIT_FOR_SECONDS"],
      let seconds = Double(waitSeconds)
    {
      return try await runHMRSmoke(waitSeconds: seconds)
    }

    let host = EclipsaHostController(runtime: JavaScriptCoreRuntime())
    await host.bootIfNeeded()

    let initialTree = try require(host.root, message: "Boot script did not publish a root tree.")
    let button = try require(
      findNode(in: initialTree) { $0.tag == "swiftui:button" },
      message: "Missing button node."
    )
    let input = try require(
      findNode(in: initialTree) { $0.tag == "swiftui:text-field" },
      message: "Missing text field node."
    )
    let toggle = try require(
      findNode(in: initialTree) { $0.tag == "swiftui:toggle" },
      message: "Missing toggle node."
    )

    try await host.dispatchEventNow(nodeID: button.id, eventName: "press", payload: nil)
    try await host.dispatchEventNow(nodeID: input.id, eventName: "input", payload: "macOS")
    try await host.dispatchEventNow(nodeID: toggle.id, eventName: "toggle", payload: false)

    let finalTree = try require(host.root, message: "Runtime events did not publish an updated tree.")
    return SmokeOutput(finalTree: finalTree, initialTree: initialTree)
  }

  @MainActor
  private static func runHMRSmoke(waitSeconds: Double) async throws -> SmokeOutput {
    let host = EclipsaHostController(runtime: JavaScriptCoreRuntime())
    await host.bootIfNeeded()

    let initialTree = try require(host.root, message: "Boot script did not publish a root tree.")
    try SmokeSignals.signalInitialTreeReady()
    try await Task.sleep(nanoseconds: UInt64(waitSeconds * 1_000_000_000))
    let finalTree = try require(host.root, message: "HMR did not publish an updated root tree.")
    return SmokeOutput(finalTree: finalTree, initialTree: initialTree)
  }
}

private func findNode(in root: NativeNode, where predicate: (NativeNode) -> Bool) -> NativeNode? {
  if predicate(root) {
    return root
  }
  for child in root.children {
    if let match = findNode(in: child, where: predicate) {
      return match
    }
  }
  return nil
}

private func require<T>(_ value: T?, message: String) throws -> T {
  guard let value else {
    throw SmokeError(message: message)
  }
  return value
}

private struct SmokeError: LocalizedError {
  let message: String

  var errorDescription: String? {
    message
  }
}
