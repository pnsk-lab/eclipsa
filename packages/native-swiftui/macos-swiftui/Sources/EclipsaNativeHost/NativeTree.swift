import Foundation

public struct NativeNode: Codable, Equatable, Identifiable, Sendable {
  public let id: String
  public var tag: String
  public var text: String?
  public var props: [String: String]
  public var children: [NativeNode]

  public init(
    id: String,
    tag: String,
    text: String?,
    props: [String: String],
    children: [NativeNode],
  ) {
    self.id = id
    self.tag = tag
    self.text = text
    self.props = props
    self.children = children
  }

  public func stringProp(_ key: String) -> String? {
    props[key]
  }

  public func doubleProp(_ key: String) -> Double? {
    guard let value = props[key] else {
      return nil
    }
    return Double(value)
  }

  public func boolProp(_ key: String) -> Bool? {
    guard let value = props[key] else {
      return nil
    }
    return value == "true"
  }
}
