---
title: Android
description: Environment notes for running eclipsa native apps on Android from NixOS, macOS, Windows, or Ubuntu.
---

# Android

This page is a practical setup memo for running the Compose host used by `@eclipsa/native-android-compose`.

The examples below assume you are working from `examples/android-compose` or another project using the same host package.

## What eclipsa expects

The native Compose host currently expects these tools and environment variables to be available:

- `adb`
- Android SDK with `platform-tools`, `emulator`, and at least one system image
- A Java runtime for Gradle
- `ANDROID_HOME` or `ANDROID_SDK_ROOT`
- `JAVA_HOME`

Helpful env vars during development:

- `ECLIPSA_NATIVE_COMPOSE_EMULATOR=1`
- `ECLIPSA_NATIVE_COMPOSE_AVD=<avd-name>`
- `ECLIPSA_NATIVE_COMPOSE_BOOT_TIMEOUT_MS=<milliseconds>`

Typical development command:

```bash
cd examples/android-compose
ECLIPSA_NATIVE_COMPOSE_EMULATOR=1 bun dev
```

If you already know which AVD you want:

```bash
cd examples/android-compose
ECLIPSA_NATIVE_COMPOSE_EMULATOR=1 ECLIPSA_NATIVE_COMPOSE_AVD=Pixel_8_API_35 bun dev
```

## Recommended AVD shape

For the current Android Compose host, a lighter emulator profile tends to behave better than the newest Play Store image.

- API 35
- `google_apis`
- `x86_64`
- 4 GB RAM if your machine can spare it
- Graphics set to `Auto` or `Hardware`

Play Store images can work, but they are heavier and often less pleasant during framework development.

## NixOS

NixOS is the most environment-sensitive path because the Android emulator expects an FHS-style runtime.

Recommended approach:

1. Install Android Studio or an SDK composition that includes the emulator and a system image.
2. Install `android-tools`, `steam-run`, and a JDK.
3. Export `ANDROID_HOME`, `ANDROID_SDK_ROOT`, and `JAVA_HOME`.
4. Add your user to the `kvm` group for hardware acceleration.
5. Create the AVD from Android Studio's Device Manager.
6. Launch the emulator with `steam-run`.

Minimal direction:

```nix
{
  nixpkgs.config.android_sdk.accept_license = true;

  environment.systemPackages = with pkgs; [
    android-studio
    android-tools
    steam-run
    jdk17_headless
  ];

  users.users.<your-user>.extraGroups = [ "kvm" ];
}
```

You can also use `pkgs.androidenv.composeAndroidPackages` if you want a smaller SDK instead of `android-studio-full`.

Suggested shell environment:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/run/current-system/sw/lib/openjdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Start the emulator explicitly:

```bash
steam-run "$ANDROID_HOME/emulator/emulator" -gpu host -feature -Vulkan @Eclipsa_API35
```

Then start the eclipsa app:

```bash
cd examples/android-compose
ECLIPSA_NATIVE_COMPOSE_EMULATOR=1 ECLIPSA_NATIVE_COMPOSE_AVD=Eclipsa_API35 bun dev
```

Notes:

- If the emulator crashes on missing shared libraries, run it through `steam-run` instead of the raw binary.
- If performance is poor, confirm that your user is in `kvm` and prefer a non-Play-Store `x86_64` image.
- If Gradle cannot find Java, check `JAVA_HOME` first.

## Windows

Windows is usually the simplest path if you use Android Studio's normal installer.

1. Install Android Studio for Windows.
2. Let the Setup Wizard install the SDK, platform-tools, emulator, and at least one system image.
3. Enable CPU virtualization in BIOS if it is disabled.
4. Enable Windows Hypervisor Platform.
5. Create an AVD in Device Manager.
6. Set `ANDROID_HOME`, `ANDROID_SDK_ROOT`, and `JAVA_HOME` in your user environment if your shell does not already expose them.

Typical PowerShell environment:

```powershell
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"
```

Then run:

```powershell
cd examples\android-compose
$env:ECLIPSA_NATIVE_COMPOSE_EMULATOR="1"
$env:ECLIPSA_NATIVE_COMPOSE_AVD="Pixel_8_API_35"
bun dev
```

Notes:

- If the emulator is extremely slow, verify that Windows Hypervisor Platform is enabled and reboot after changing it.
- Prefer WHPX over older emulator hypervisor-driver setups on new Windows installs.
- If `adb` works in Android Studio but not in your shell, your `Path` is incomplete.

## macOS

macOS is close to the standard Android Studio flow and usually does not need the extra emulator workarounds that NixOS does.

1. Install Android Studio for macOS.
2. Complete the Setup Wizard so it installs the SDK, platform-tools, emulator, and at least one system image.
3. Create an AVD in Device Manager.
4. Export `ANDROID_HOME`, `ANDROID_SDK_ROOT`, and `JAVA_HOME` in your shell if they are not already available.

Typical shell setup:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Then run:

```bash
cd examples/android-compose
ECLIPSA_NATIVE_COMPOSE_EMULATOR=1 ECLIPSA_NATIVE_COMPOSE_AVD=Pixel_8_API_35 bun dev
```

Notes:

- On Apple Silicon, prefer an ARM64 system image when you want the smoothest emulator performance.
- If `JAVA_HOME` is wrong, Gradle install steps usually fail before the app launches.
- If `adb devices` works in Android Studio but not in Terminal, your shell `PATH` is still missing SDK paths.

## Ubuntu

Ubuntu is close to the standard Android Studio Linux flow.

1. Install Android Studio.
2. Run the Setup Wizard and install the emulator, platform-tools, and at least one `x86_64` system image.
3. Make sure KVM virtualization is available.
4. Export `ANDROID_HOME`, `ANDROID_SDK_ROOT`, and `JAVA_HOME`.
5. Create an AVD in Device Manager.

Basic shell setup:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="/opt/android-studio/jbr"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Then run:

```bash
cd examples/android-compose
ECLIPSA_NATIVE_COMPOSE_EMULATOR=1 ECLIPSA_NATIVE_COMPOSE_AVD=Pixel_8_API_35 bun dev
```

Notes:

- If Android Studio was installed somewhere else, adjust `JAVA_HOME` to that installation's `jbr`.
- On Ubuntu, emulator smoothness usually depends more on KVM and GPU acceleration than on Bun or Vite.
- If you see missing library errors from the emulator, install the packages Android Studio asks for before debugging eclipsa itself.

## Troubleshooting

### `JAVA_HOME is not set`

Set `JAVA_HOME` and ensure `java` is on `PATH`.

### `Could not resolve "adb"`

Add Android SDK `platform-tools` to `PATH`, or set `ANDROID_HOME` / `ANDROID_SDK_ROOT` correctly.

### `No Android Virtual Devices are available`

Create an AVD first from Android Studio's Device Manager.

### `Activity class ... does not exist`

The Compose host app is not installed yet. The current dev host tries to run `:app:installDebug` automatically, so this usually means Java or Android SDK discovery is still incomplete.

## References

- Android Studio install guide: https://developer.android.com/studio/install
- Android emulator acceleration: https://developer.android.com/studio/run/emulator-acceleration
- Android virtual devices: https://developer.android.com/studio/run/managing-avds
- Android emulator command line: https://developer.android.com/studio/run/emulator-commandline
- NixOS Android wiki: https://wiki.nixos.org/wiki/Android
