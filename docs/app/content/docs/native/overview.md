---
title: Native
description: Build and run eclipsa apps against native hosts such as Android Compose.
---

# Eclipsa Native

`@eclipsa/native` lets an eclipsa app target a native host instead of the browser DOM.

Right now the main experimental path in this repository is Android via `@eclipsa/native-android-compose`, which runs an Android host app and feeds it the native dev manifest from your eclipsa app.

## What stays the same

- You still write route files in `app/`
- You still run a Vite-based dev server
- You still use the same JSX-first authoring flow

## What changes

- You need a platform host app
- You need native tooling on your machine
- You often need an emulator or a physical device

## Android

For Android setup notes, including NixOS, Windows, and Ubuntu, see [Android](/docs/native/android).
