# SwiftUI Example

This example uses `@eclipsa/native` with the SwiftUI target. Lowercase JSX tags are resolved
through `app/+native-map.ts`, so the route files can stay close to web-style authoring while the
map file imports the actual SwiftUI binding components.

Commands:

```sh
bun run --cwd examples/swiftui dev
bun run --cwd examples/swiftui build
bun run --cwd examples/swiftui test
```

`bun dev` uses Vite's environment API with the `nativeSwift` environment and launches the macOS
SwiftUI host automatically once the native dev manifest is ready. The host reads
`/__eclipsa_native__/manifest.json`, imports transformed modules over HTTP through Vite's
environment RPC, and listens to the same HMR websocket used by the dev server.

The SwiftUI host package lives at `packages/native-swiftui/macos-swiftui`.
