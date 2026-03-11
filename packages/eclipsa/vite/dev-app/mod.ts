import type { Context } from "hono";
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

const injectResumeScript = (html: string, payloadScript: string) =>
  html.includes("</head>") ? html.replace("</head>", `${payloadScript}</head>`) : `${payloadScript}${html}`;

const createDevApp = async (init: DevAppInit) => {
  const { default: app } = await init.runner.import("/app/+server-entry.ts");
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
): ((req: Request) => Promise<Response | undefined>) => {
  let app = createDevApp(init);

  return async (req) => {
    const fetched = await (await app).fetch(req);
    if (fetched.status === 404) {
      return;
    }
    return fetched;
  };
};
