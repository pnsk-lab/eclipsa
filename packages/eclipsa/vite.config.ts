import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["core/**/*.test.ts", "transformers/**/*.test.ts"],
    environment: "node",
  },
  pack: {
    entry: [
      "mod.ts",
      "vite/mod.ts",
      "jsx/mod.ts",
      "jsx/jsx-runtime.ts",
      "jsx/jsx-dev-runtime.ts",
      "core/dev-client/mod.ts",
    ],
    dts: true,
    format: ["esm"],
    clean: true,
    sourcemap: true,
  },
});
