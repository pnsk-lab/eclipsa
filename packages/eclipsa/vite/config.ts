import type { Plugin } from "vite";
import { cwd } from "node:process";
import path from "node:path";
import { createRoutes } from "./utils/routing.ts";
import { build } from "./build/mod.ts";
import { collectAppSymbols } from "./compiler.ts";

export const createConfig: Plugin["config"] = async (userConfig) => {
  const root = userConfig.root ?? cwd();
  const routes = await createRoutes(root);
  const symbols = await collectAppSymbols(root);

  const clientInput = Object.fromEntries([
    ["client_boot", path.join(root, "app/+client.dev.tsx")],
    ...symbols.map((symbol) => [`symbol__${symbol.id}`, `${symbol.filePath}?eclipsa-symbol=${symbol.id}`]),
    ...routes.map((route) => [`route__${route.entryName}`, route.filePath]),
  ]);

  const ssrInput = Object.fromEntries([
    ["server_entry", path.join(root, "app/+server-entry.ts")],
    ["ssr_root", path.join(root, "app/+ssr-root.tsx")],
    ["eclipsa_runtime", path.join(root, "../packages/eclipsa/vite/build/runtime.ts")],
    ...routes.map((route) => [`route__${route.entryName}`, route.filePath]),
  ]);

  return {
    esbuild: {
      jsx: "preserve",
      jsxFactory: "jsx",
      jsxImportSource: "eclipsa",
      sourcemap: false,
    },
    environments: {
      client: {
        build: {
          emptyOutDir: true,
          outDir: path.join(root, "dist/client"),
          rollupOptions: {
            input: clientInput,
            output: {
              assetFileNames: "assets/[name]-[hash][extname]",
              chunkFileNames: "chunks/[name]-[hash].js",
              entryFileNames: "entries/[name].js",
            },
            preserveEntrySignatures: "allow-extension",
          },
        },
      },
      ssr: {
        build: {
          emptyOutDir: true,
          outDir: path.join(root, "dist/ssr"),
          rollupOptions: {
            input: ssrInput,
            output: {
              assetFileNames: "assets/[name]-[hash][extname]",
              chunkFileNames: "chunks/[name]-[hash].mjs",
              entryFileNames: "entries/[name].mjs",
            },
            preserveEntrySignatures: "allow-extension",
          },
        },
      },
    },
    builder: {
      async buildApp(builder) {
        await build(builder, userConfig);
      },
    },
  };
};
