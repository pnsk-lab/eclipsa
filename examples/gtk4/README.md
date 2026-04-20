# GTK 4 Example

This example uses `@eclipsa/native` with the GTK 4 target. Lowercase JSX tags are resolved
through `app/+native-map.ts`, so the route files can stay close to web-style authoring while the
map file imports the actual GTK 4 binding components.

Commands:

```sh
bun run --cwd examples/gtk4 dev
bun run --cwd examples/gtk4 build
bun run --cwd examples/gtk4 test
```

`dev` auto-launches the Rust GTK 4 host on Linux by default. That host is compiled from
`packages/native-gtk4/gtk4-rust`, so you need `cargo` plus local GTK 4 development libraries
installed for the real windowed host.

`test` still works without GTK system libraries because it builds the manifest and then drives the
Rust smoke host (`eclipsa-native-gtk4-smoke`), which verifies the bootstrap bundle, event bridge,
and state updates without opening a native window.

The GTK 4 target package lives at `packages/native-gtk4`.
