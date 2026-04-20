# Client benchmark

`run.js` does the following:

1. Clone `krausest/js-framework-benchmark` into `.cache/js-framework-benchmark` (if missing).
2. Copy this repository's Eclipsa implementation template into `frameworks/keyed/eclipsa`.
3. Install root dependencies.
4. Install and compile `webdriver-ts` without postinstall scripts.
5. Rebuild `keyed/eclipsa`, start the benchmark server, and run benchmark with Playwright runner.

Run:

```bash
# optional when Chrome is not at /usr/bin/google-chrome
# export CHROME_BINARY=/path/to/chrome-or-chromium
bun run bench
```
