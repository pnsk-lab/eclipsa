# benchmarks

This directory is a dedicated benchmarks monorepo.

## SSR benchmark

```bash
bun run --cwd benchmarks ssr:build
bun run --cwd benchmarks ssr:bench:bun
```

## Client benchmark (js-framework-benchmark)

```bash
bun run --cwd benchmarks client:bench
```

The client benchmark script clones `krausest/js-framework-benchmark`, adds an `eclipsa` implementation, installs dependencies, and runs the benchmark command.
