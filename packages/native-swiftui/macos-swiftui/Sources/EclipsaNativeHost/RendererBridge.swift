import Foundation

private struct RendererRecord {
  var childIDs: [String]
  var props: [String: String]
  var tag: String
  var text: String?
}

@MainActor
public final class SwiftUIRendererBridge {
  public weak var store: NativeTreeStore?

  public var rootNodeID: String?

  private var nextID = 0
  private var records: [String: RendererRecord] = [:]

  public init() {}

  public func createElement(type: String) -> String {
    let nodeID = allocateID()
    records[nodeID] = RendererRecord(childIDs: [], props: [:], tag: type, text: nil)
    return nodeID
  }

  public func createText(value: String) -> String {
    let nodeID = allocateID()
    records[nodeID] = RendererRecord(childIDs: [], props: [:], tag: "swiftui:text", text: value)
    return nodeID
  }

  public func insert(parentID: String, childID: String, beforeID: String?) {
    guard var parent = records[parentID] else {
      return
    }
    parent.childIDs.removeAll { $0 == childID }
    if let beforeID, let index = parent.childIDs.firstIndex(of: beforeID) {
      parent.childIDs.insert(childID, at: index)
    } else {
      parent.childIDs.append(childID)
    }
    records[parentID] = parent
  }

  public func remove(parentID: String, childID: String) {
    guard var parent = records[parentID] else {
      return
    }
    parent.childIDs.removeAll { $0 == childID }
    records[parentID] = parent
    records.removeValue(forKey: childID)
  }

  public func reorder(parentID: String, childID: String, beforeID: String?) {
    insert(parentID: parentID, childID: childID, beforeID: beforeID)
  }

  public func setProp(nodeID: String, key: String, value: String) {
    guard var record = records[nodeID] else {
      return
    }
    record.props[key] = value
    records[nodeID] = record
  }

  public func removeProp(nodeID: String, key: String) {
    guard var record = records[nodeID] else {
      return
    }
    record.props.removeValue(forKey: key)
    records[nodeID] = record
  }

  public func setText(nodeID: String, value: String) {
    guard var record = records[nodeID] else {
      return
    }
    record.text = value
    records[nodeID] = record
  }

  public func publish(rootID: String? = nil) {
    if let rootID {
      rootNodeID = rootID
    }
    guard let rootNodeID else {
      store?.root = nil
      return
    }
    store?.root = materializeTree(nodeID: rootNodeID)
  }

  private func allocateID() -> String {
    nextID += 1
    return "native-node-\(nextID)"
  }

  private func materializeTree(nodeID: String) -> NativeNode? {
    guard let record = records[nodeID] else {
      return nil
    }
    return NativeNode(
      id: nodeID,
      tag: record.tag,
      text: record.text,
      props: record.props,
      children: record.childIDs.compactMap(materializeTree)
    )
  }
}
