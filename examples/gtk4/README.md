# GTK4 Example

This example uses `@eclipsa/native` with the GTK4 target. Lowercase JSX tags are resolved through
`app/+native-map.ts`, so the route files can stay close to web-style authoring while the map file
imports the actual GTK4 binding components.

Commands:

```sh
cd examples/gtk4
bun run dev
bun run build
bun run test
```

`bun run dev` launches the GTK4 host automatically when a bundled host binary is available, or
when you pass an explicit `gtk4({ command: [...] })` host command in `vite.config.ts`.

The GTK4 binding package lives at `packages/native-gtk4`.
