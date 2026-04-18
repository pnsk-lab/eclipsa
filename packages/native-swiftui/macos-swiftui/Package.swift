// swift-tools-version: 5.10
import PackageDescription

let package = Package(
  name: "EclipsaNativeMacOS",
  platforms: [
    .macOS(.v14),
  ],
  products: [
    .library(
      name: "EclipsaNativeHost",
      targets: ["EclipsaNativeHost"]
    ),
    .executable(
      name: "EclipsaNativeMacOS",
      targets: ["EclipsaNativeMacOS"]
    ),
    .executable(
      name: "EclipsaNativeSmoke",
      targets: ["EclipsaNativeSmoke"]
    ),
  ],
  targets: [
    .target(
      name: "EclipsaNativeHost",
      path: "Sources/EclipsaNativeHost",
      resources: [
        .process("Resources"),
      ],
      linkerSettings: [
        .linkedFramework("JavaScriptCore"),
      ]
    ),
    .executableTarget(
      name: "EclipsaNativeMacOS",
      dependencies: ["EclipsaNativeHost"],
      path: "Sources/EclipsaNativeMacOS",
      linkerSettings: [
        .linkedFramework("JavaScriptCore"),
      ]
    ),
    .executableTarget(
      name: "EclipsaNativeSmoke",
      dependencies: ["EclipsaNativeHost"],
      path: "Sources/EclipsaNativeSmoke",
      linkerSettings: [
        .linkedFramework("JavaScriptCore"),
      ]
    ),
  ]
)
