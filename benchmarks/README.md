# benchmarks

Build the benchmark fixtures first:

```bash
bun run build
# or from the repo root
bun run benchmark:build
```

Run on Bun:

```bash
bun run bench:bun
# or from the repo root
bun run benchmark:bun
```

Run on Node.js:

```bash
node ./benchmark.js
```

Run on Deno:

```bash
deno run --import-map=./deno.import-map.json --allow-read --allow-env --allow-sys --node-modules-dir=auto ./benchmark.js
```

You can also use the package scripts:

```bash
bun run bench:node
bun run bench:deno
# or from the repo root
bun run benchmark:node
bun run benchmark:deno
```
