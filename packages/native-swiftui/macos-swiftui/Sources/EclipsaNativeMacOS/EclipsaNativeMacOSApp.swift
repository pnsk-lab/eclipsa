import EclipsaNativeHost
import SwiftUI

@main
struct EclipsaNativeMacOSApp: App {
  @StateObject private var host = EclipsaHostController()

  var body: some Scene {
    WindowGroup {
      NativeRootView(node: host.root)
        .environmentObject(host)
        .task {
          await host.bootIfNeeded()
        }
        .frame(minWidth: 480, minHeight: 320)
    }
  }
}

struct NativeRootView: View {
  let node: NativeNode?

  var body: some View {
    Group {
      if let node {
        NativeNodeView(node: node)
      } else {
        ProgressView("Booting Eclipsa native runtime…")
      }
    }
  }
}

struct NativeNodeView: View {
  @EnvironmentObject private var host: EclipsaHostController

  let node: NativeNode

  var body: some View {
    switch node.tag {
    case "swiftui:window-group", "swiftui:vstack":
      VStack(alignment: .leading, spacing: node.doubleProp("spacing") ?? 12) {
        childViews
      }
    case "swiftui:hstack":
      HStack(alignment: .center, spacing: node.doubleProp("spacing") ?? 12) {
        childViews
      }
    case "swiftui:text":
      Text(node.stringProp("verbatim") ?? node.stringProp("value") ?? node.text ?? "")
    case "swiftui:button":
      Button(role: buttonRole) {
        host.dispatchEvent(nodeID: node.id, eventName: "press")
      } label: {
        if node.children.isEmpty {
          Text(node.stringProp("title") ?? "Button")
        } else {
          childViews
        }
      }
    case "swiftui:image":
      Image(systemName: node.stringProp("systemName") ?? "circle")
    case "swiftui:text-field":
      TextField(
        node.stringProp("placeholder") ?? "",
        text: Binding(
          get: { node.stringProp("value") ?? "" },
          set: { newValue in
            host.updateString(nodeID: node.id, key: "value", value: newValue)
            host.dispatchEvent(nodeID: node.id, eventName: "input", payload: newValue)
          }
        )
      )
    case "swiftui:toggle":
      Toggle(
        isOn: Binding(
          get: { node.boolProp("value") ?? false },
          set: { newValue in
            host.updateBool(nodeID: node.id, key: "value", value: newValue)
            host.dispatchEvent(nodeID: node.id, eventName: "toggle", payload: newValue)
          }
        )
      ) {
        if node.children.isEmpty {
          Text(node.stringProp("title") ?? "Toggle")
        } else {
          childViews
        }
      }
    case "swiftui:list":
      List {
        childViews
      }
    case "swiftui:spacer":
      Spacer()
    default:
      VStack(alignment: .leading, spacing: 8) {
        Text(node.tag).font(.headline)
        childViews
      }
    }
  }

  @ViewBuilder
  private var childViews: some View {
    ForEach(node.children) { child in
      NativeNodeView(node: child)
    }
  }

  private var buttonRole: ButtonRole? {
    switch node.stringProp("role") {
    case "cancel":
      return .cancel
    case "destructive":
      return .destructive
    default:
      return nil
    }
  }
}
