import { Hono, type Context } from "hono";
import type { DevEnvironment, ResolvedConfig, ViteDevServer } from "vite";
import type { ModuleRunner } from "vite/module-runner";
import type { SSRRootProps } from "../../core/types.ts";
import { Fragment, jsxDEV } from "../../jsx/jsx-dev-runtime.ts";
import { createRoutes, type RouteEntry } from "../utils/routing.ts";
import * as path from "node:path";
import { collectAppSymbols, createDevSymbolUrl } from "../compiler.ts";

interface DevAppInit {
  resolvedConfig: ResolvedConfig;
  devServer: ViteDevServer;
  runner: ModuleRunner;
  ssrEnv: DevEnvironment;
}

export interface DevFetchController {
  fetch(req: Request): Promise<Response | undefined>;
  invalidate(): void;
}

const toAppRelativePath = (root: string, filePath: string) => {
  const relativePath = path.relative(path.join(root, "app"), filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }
  return relativePath.replaceAll("\\", "/");
};

export const shouldInvalidateDevApp = (root: string, filePath: string, event: "add" | "change" | "unlink") => {
  const relativePath = toAppRelativePath(root, filePath);
  if (!relativePath) {
    return false;
  }
  if (relativePath === "+server-entry.ts") {
    return true;
  }
  if (relativePath.endsWith(".tsx")) {
    return event === "add" || event === "change" || event === "unlink";
  }
  return false;
};

const injectResumeScript = (html: string, payloadScript: string) =>
  html.includes("</head>") ? html.replace("</head>", `${payloadScript}</head>`) : `${payloadScript}${html}`;

const createDevApp = async (init: DevAppInit) => {
  const { default: userApp } = await init.runner.import("/app/+server-entry.ts");
  const app = new Hono();
  app.route("/", userApp);
  const allSymbols = await collectAppSymbols(init.resolvedConfig.root);
  const symbolUrls = Object.fromEntries(
    allSymbols.map((symbol) => [
      symbol.id,
      createDevSymbolUrl(init.resolvedConfig.root, symbol.filePath, symbol.id),
    ]),
  );

  const createHandler = (entry: RouteEntry) => async (c: Context) => {
    const [{ default: Page }, { default: SSRRoot }, { renderSSR, serializeResumePayload }] =
      await Promise.all([
        init.runner.import(entry.filePath),
        init.runner.import("/app/+ssr-root.tsx"),
        init.runner.import("eclipsa"),
      ]);

    const document = SSRRoot({
      children: jsxDEV(Page, {}, null, false, {}),
      head: {
        type: Fragment,
        isStatic: true,
        props: {
          children: [
            {
              type: "script",
              isStatic: true,
              props: {
                children: 'import("/@vite/client")',
              },
            },
            {
              type: "script",
              props: {
                src: "/app/+client.dev.tsx",
                type: "module",
              },
            },
          ],
        },
      },
    } satisfies SSRRootProps);

    const { html, payload } = renderSSR(() => document, {
      symbols: symbolUrls,
    });
    const payloadScript = `<script type="application/eclipsa-resume+json" id="eclipsa-resume">${
      serializeResumePayload(payload)
    }</script>`;

    return c.html(injectResumeScript(html, payloadScript));
  };

  for (const entry of await createRoutes(init.resolvedConfig.root)) {
    app.get(entry.honoPath, createHandler(entry));
  }

  return app;
};

export const createDevFetch = (
  init: DevAppInit,
): DevFetchController => {
  let app: ReturnType<typeof createDevApp> | null = null;
  const getApp = () => {
    app ??= createDevApp(init);
    return app;
  };

  return {
    invalidate() {
      app = null;
    },
    async fetch(req) {
      const fetched = await (await getApp()).fetch(req);
      if (fetched.status === 404) {
        return;
      }
      return fetched;
    },
  };
};
