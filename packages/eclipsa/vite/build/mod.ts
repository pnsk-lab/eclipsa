import type { UserConfig, ViteBuilder } from 'vite'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { cwd } from 'node:process'
import type { RouteManifest } from '../../core/router-shared.ts'
import { ROUTE_MANIFEST_ELEMENT_ID } from '../../core/router-shared.ts'
import {
  createBuildModuleUrl,
  createBuildServerModuleUrl,
  createRouteManifest,
  createRoutes,
} from '../utils/routing.ts'
import { collectAppSymbols, createBuildSymbolUrl } from '../compiler.ts'

const renderServer = (
  routes: Awaited<ReturnType<typeof createRoutes>>,
  routeManifest: RouteManifest,
  symbolUrls: Record<string, string>,
) => {
  const routeTable = routes
    .map(
      (route) =>
        `  ${JSON.stringify(route.honoPath)}: { page: ${JSON.stringify(createBuildServerModuleUrl(route.page))}, layouts: [${route.layouts
          .map((layout) => JSON.stringify(createBuildServerModuleUrl(layout)))
          .join(', ')}] },`,
    )
    .join('\n')

  const serializedSymbolUrls = JSON.stringify(symbolUrls)
  const serializedRouteManifest = JSON.stringify(routeManifest)

  return `import userApp from "../ssr/entries/server_entry.mjs";
import SSRRoot from "../ssr/entries/ssr_root.mjs";
import { Fragment, jsxDEV, renderSSR, serializeResumePayload } from "../ssr/entries/eclipsa_runtime.mjs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = userApp;
const routes = {
${routeTable}
};
const routeManifest = ${serializedRouteManifest};
const symbolUrls = ${serializedSymbolUrls};

const fileTypes = new Map([
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, "../client");

const toRequest = (incomingMessage) => {
  const body =
    incomingMessage.method !== "GET" && incomingMessage.method !== "HEAD"
      ? new ReadableStream({
          start(controller) {
            incomingMessage.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
            incomingMessage.on("end", () => controller.close());
          },
        })
      : null;
  const headers = new Headers();
  for (const [key, value] of Object.entries(incomingMessage.headers)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => headers.append(key, entry));
    } else if (value) {
      headers.append(key, value);
    }
  }
  return new Request(new URL(incomingMessage.url ?? "/", "http://localhost"), {
    method: incomingMessage.method,
    headers,
    body,
  });
};

const sendResponse = async (response, serverResponse) => {
  for (const [key, value] of response.headers) {
    serverResponse.setHeader(key, value);
  }
  serverResponse.statusCode = response.status;
  serverResponse.statusMessage = response.statusText;
  const buffer = Buffer.from(await response.arrayBuffer());
  serverResponse.end(buffer);
};

const serveStatic = async (pathname) => {
  const normalized = pathname.replace(/^\\/+/, "");
  const filePath = path.join(clientDir, normalized);
  if (!filePath.startsWith(clientDir)) {
    return null;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return null;
    }
    return new Response(await readFile(filePath), {
      headers: {
        "content-type": fileTypes.get(path.extname(filePath)) ?? "application/octet-stream",
      },
    });
  } catch {
    return null;
  }
};

const injectHeadScripts = (html, ...scripts) => {
  const scriptMarkup = scripts.join("");
  return html.includes("</head>") ? html.replace("</head>", scriptMarkup + "</head>") : scriptMarkup + html;
};

const ROUTE_SLOT_ROUTE_KEY = Symbol.for("eclipsa.route-slot-route");

const createRouteSlot = (route, startLayoutIndex) => {
  const slot = {
    __eclipsa_type: "route-slot",
    pathname: route.pathname,
    startLayoutIndex,
  };
  Object.defineProperty(slot, ROUTE_SLOT_ROUTE_KEY, {
    configurable: true,
    enumerable: false,
    value: route,
    writable: true,
  });
  return slot;
};

const createRouteElement = (pathname, Page, Layouts) => {
  if (Layouts.length === 0) {
    return jsxDEV(Page, {}, null, false, {});
  }

  const route = {
    layouts: Layouts.map((renderer) => ({ renderer })),
    page: { renderer: Page },
    pathname,
  };
  let children = null;
  for (let index = Layouts.length - 1; index >= 0; index -= 1) {
    const Layout = Layouts[index];
    children = jsxDEV(Layout, { children: createRouteSlot(route, index + 1) }, null, false, {});
  }
  return children;
};

for (const [routePath, route] of Object.entries(routes)) {
  app.get(routePath, async (c) => {
    const [{ default: Page }, ...layoutModules] = await Promise.all([
      import(route.page),
      ...route.layouts.map((layout) => import(layout)),
    ]);
    const Layouts = layoutModules.map((module) => module.default);
    const document = SSRRoot({
      children: createRouteElement(routePath, Page, Layouts),
      head: {
        type: Fragment,
        isStatic: true,
        props: {
          children: [
            {
              type: "script",
              isStatic: true,
              props: {
                type: "module",
                src: "/entries/client_boot.js",
              },
            },
          ],
        },
      },
    });

    const { html, payload } = renderSSR(() => document, {
      symbols: symbolUrls,
    });
    const payloadScript = '<script type="application/eclipsa-resume+json" id="eclipsa-resume">' + serializeResumePayload(payload) + "</script>";
    const routeManifestScript = '<script type="application/eclipsa-route-manifest+json" id="${ROUTE_MANIFEST_ELEMENT_ID}">' + JSON.stringify(routeManifest) + "</script>";
    return c.html(injectHeadScripts(html, payloadScript, routeManifestScript));
  });
}

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const staticResponse = await serveStatic(url.pathname);
  if (staticResponse) {
    await sendResponse(staticResponse, res);
    return;
  }

  const response = await app.fetch(toRequest(req));
  await sendResponse(response, res);
}).listen(port, () => {
  console.log("Eclipsa server listening on http://localhost:" + port);
});
`
}

export const build = async (builder: ViteBuilder, userConfig: UserConfig) => {
  const root = userConfig.root ?? cwd()
  const routes = await createRoutes(root)
  const routeManifest = createRouteManifest(routes, createBuildModuleUrl)
  const symbols = await collectAppSymbols(root)
  const symbolUrls = Object.fromEntries(
    symbols.map((symbol) => [symbol.id, createBuildSymbolUrl(symbol.id)]),
  )

  await builder.build(builder.environments.client)
  await builder.build(builder.environments.ssr)

  const serverDir = path.join(root, 'dist/server')
  await fs.mkdir(serverDir, { recursive: true })
  await fs.writeFile(
    path.join(serverDir, 'index.mjs'),
    renderServer(routes, routeManifest, symbolUrls),
  )
}
