# Android Compose Example

This example uses `@eclipsa/native` with the Jetpack Compose target. Lowercase JSX tags are
resolved through `app/+native-map.ts`, so the route files can stay close to web-style authoring
while the map file imports the actual Compose binding components.

Commands:

```sh
cd examples/android-compose
ECLIPSA_NATIVE_COMPOSE_EMULATOR=1 vp dev
ECLIPSA_NATIVE_COMPOSE_EMULATOR=1 ECLIPSA_NATIVE_COMPOSE_AVD=Pixel_8_API_35 vp dev
bun run --cwd examples/android-compose build
bun run --cwd examples/android-compose test
```

`vp` itself rejects unknown CLI flags before the Compose target can see them, so emulator launch is
configured through environment variables instead:

- `ECLIPSA_NATIVE_COMPOSE_EMULATOR=1`
- `ECLIPSA_NATIVE_COMPOSE_AVD=<avd-name>`
- `ECLIPSA_NATIVE_COMPOSE_BOOT_TIMEOUT_MS=<milliseconds>`

With those set, the native host launcher will start an Android emulator if needed and then open the
Compose host activity once the native dev manifest is ready.

The Android host project lives at `packages/native-compose/android-compose`.
