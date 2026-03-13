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
  type RouteEntry,
} from '../utils/routing.ts'
import {
  collectAppActions,
  collectAppLoaders,
  collectAppSymbols,
  createBuildServerActionUrl,
  createBuildServerLoaderUrl,
  createBuildSymbolUrl,
} from '../compiler.ts'

const renderServer = (
  actions: Array<{ filePath: string; id: string }>,
  loaders: Array<{ filePath: string; id: string }>,
  routes: Awaited<ReturnType<typeof createRoutes>>,
  routeManifest: RouteManifest,
  symbolUrls: Record<string, string>,
) => {
  const serializedRoutes = JSON.stringify(
    routes.map((route) => ({
      error: route.error ? createBuildServerModuleUrl(route.error) : null,
      layouts: route.layouts.map((layout) => createBuildServerModuleUrl(layout)),
      loading: route.loading ? createBuildServerModuleUrl(route.loading) : null,
      notFound: route.notFound ? createBuildServerModuleUrl(route.notFound) : null,
      page: route.page ? createBuildServerModuleUrl(route.page) : null,
      routePath: route.routePath,
      segments: route.segments,
      server: route.server ? createBuildServerModuleUrl(route.server) : null,
    })),
  )
  const actionTable = actions
    .map(
      (action) =>
        `  ${JSON.stringify(action.id)}: ${JSON.stringify(createBuildServerActionUrl(action.id))},`,
    )
    .join('\n')
  const loaderTable = loaders
    .map(
      (loader) =>
        `  ${JSON.stringify(loader.id)}: ${JSON.stringify(createBuildServerLoaderUrl(loader.id))},`,
    )
    .join('\n')
  const serializedSymbolUrls = JSON.stringify(symbolUrls)
  const serializedRouteManifest = JSON.stringify(routeManifest)

  return `import userApp from "../ssr/entries/server_entry.mjs";
import SSRRoot from "../ssr/entries/ssr_root.mjs";
import { Fragment, executeAction, executeLoader, hasAction, hasLoader, jsxDEV, renderSSRAsync, resolvePendingLoaders, serializeResumePayload } from "../ssr/entries/eclipsa_runtime.mjs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = userApp;
const actions = {
${actionTable}
};
const loaders = {
${loaderTable}
};
const routes = ${serializedRoutes};
const routeManifest = ${serializedRouteManifest};
const symbolUrls = ${serializedSymbolUrls};
const ROUTE_PARAMS_PROP = "__eclipsa_route_params";

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

const normalizeRoutePath = (pathname) => {
  const normalizedPath = pathname.trim() || "/";
  const withLeadingSlash = normalizedPath.startsWith("/") ? normalizedPath : "/" + normalizedPath;
  return withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
};

const matchSegments = (segments, pathnameSegments, routeIndex = 0, pathIndex = 0, params = {}) => {
  if (routeIndex >= segments.length) {
    return pathIndex >= pathnameSegments.length ? params : null;
  }

  const segment = segments[routeIndex];
  switch (segment.kind) {
    case "static":
      if (pathnameSegments[pathIndex] !== segment.value) {
        return null;
      }
      return matchSegments(segments, pathnameSegments, routeIndex + 1, pathIndex + 1, params);
    case "required":
      if (pathIndex >= pathnameSegments.length) {
        return null;
      }
      return matchSegments(segments, pathnameSegments, routeIndex + 1, pathIndex + 1, {
        ...params,
        [segment.value]: pathnameSegments[pathIndex],
      });
    case "optional": {
      const consumed =
        pathIndex < pathnameSegments.length
          ? matchSegments(segments, pathnameSegments, routeIndex + 1, pathIndex + 1, {
              ...params,
              [segment.value]: pathnameSegments[pathIndex],
            })
          : null;
      if (consumed) {
        return consumed;
      }
      return matchSegments(segments, pathnameSegments, routeIndex + 1, pathIndex, {
        ...params,
        [segment.value]: undefined,
      });
    }
    case "rest":
      return matchSegments(segments, pathnameSegments, segments.length, pathnameSegments.length, {
        ...params,
        [segment.value]: pathnameSegments.slice(pathIndex),
      });
  }
};

const matchRoute = (pathname) => {
  const pathnameSegments = normalizeRoutePath(pathname).split("/").filter(Boolean);
  for (const route of routes) {
    const params = matchSegments(route.segments, pathnameSegments);
    if (params) {
      return { params, route };
    }
  }
  return null;
};

const scoreSpecialRoute = (route, pathname) => {
  const pathnameSegments = normalizeRoutePath(pathname).split("/").filter(Boolean);
  let score = 0;
  for (let index = 0; index < route.segments.length && index < pathnameSegments.length; index += 1) {
    const segment = route.segments[index];
    const pathnameSegment = pathnameSegments[index];
    if (segment.kind === "static") {
      if (segment.value !== pathnameSegment) {
        break;
      }
      score += 10;
      continue;
    }
    score += segment.kind === "rest" ? 1 : 2;
    if (segment.kind === "rest") {
      break;
    }
  }
  return score;
};

const findSpecialRoute = (pathname, kind) => {
  const matched = matchRoute(pathname);
  if (matched?.route[kind]) {
    return matched;
  }

  let best = null;
  let bestScore = -1;
  for (const route of routes) {
    if (!route[kind]) {
      continue;
    }
    const score = scoreSpecialRoute(route, pathname);
    if (score > bestScore) {
      best = { params: {}, route };
      bestScore = score;
    }
  }
  return best;
};

const applyRequestParams = (c, params) => {
  c.req.param = (name) => {
    if (!name) {
      return params;
    }
    return params[name];
  };
};

const isNotFoundError = (error) =>
  !!error && typeof error === "object" && error.__eclipsa_not_found__ === true;

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

const createRouteProps = (params, props) => {
  const nextProps = { ...props };
  Object.defineProperty(nextProps, ROUTE_PARAMS_PROP, {
    configurable: true,
    enumerable: false,
    value: params,
    writable: true,
  });
  return nextProps;
};

const createRouteElement = (pathname, params, Page, Layouts) => {
  if (Layouts.length === 0) {
    return jsxDEV(Page, createRouteProps(params, {}), null, false, {});
  }

  const route = {
    layouts: Layouts.map((renderer) => ({ renderer })),
    page: { renderer: Page },
    params,
    pathname,
  };
  let children = null;
  for (let index = Layouts.length - 1; index >= 0; index -= 1) {
    const Layout = Layouts[index];
    children = jsxDEV(Layout, createRouteProps(params, { children: createRouteSlot(route, index + 1) }), null, false, {});
  }
  return children;
};

const invokeRouteServer = async (moduleUrl, c, params) => {
  applyRequestParams(c, params);
  const mod = await import(moduleUrl);
  const methodHandler = mod[c.req.method];
  if (typeof methodHandler === "function") {
    return methodHandler(c);
  }
  const serverApp = mod.default;
  if (serverApp && typeof serverApp.fetch === "function") {
    return serverApp.fetch(c.req.raw);
  }
  return c.text("Not Found", 404);
};

const renderRouteResponse = async (route, pathname, params, c, moduleUrl, status = 200) => {
  const [{ default: Page }, ...layoutModules] = await Promise.all([
    import(moduleUrl),
    ...route.layouts.map((layout) => import(layout)),
  ]);
  const Layouts = layoutModules.map((module) => module.default);
  const document = SSRRoot({
    children: createRouteElement(pathname, params, Page, Layouts),
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

  applyRequestParams(c, params);
  const { html, payload } = await renderSSRAsync(() => document, {
    resolvePendingLoaders: async (container) => resolvePendingLoaders(container, c),
    symbols: symbolUrls,
  });
  const payloadScript = '<script type="application/eclipsa-resume+json" id="eclipsa-resume">' + serializeResumePayload(payload) + "</script>";
  const routeManifestScript = '<script type="application/eclipsa-route-manifest+json" id="${ROUTE_MANIFEST_ELEMENT_ID}">' + JSON.stringify(routeManifest) + "</script>";
  return c.html(injectHeadScripts(html, payloadScript, routeManifestScript), status);
};

const renderMatchedPage = async (match, c) => {
  const pathname = normalizeRoutePath(new URL(c.req.url).pathname);
  try {
    return await renderRouteResponse(match.route, pathname, match.params, c, match.route.page);
  } catch (error) {
    const fallback = isNotFoundError(error) ? findSpecialRoute(pathname, "notFound") : findSpecialRoute(pathname, "error");
    const kind = isNotFoundError(error) ? "notFound" : "error";
    const moduleUrl = fallback?.route?.[kind];
    if (!fallback || !moduleUrl) {
      return c.text(isNotFoundError(error) ? "Not Found" : "Internal Server Error", isNotFoundError(error) ? 404 : 500);
    }
    return renderRouteResponse(fallback.route, pathname, fallback.params, c, moduleUrl, isNotFoundError(error) ? 404 : 500);
  }
};

app.post("/__eclipsa/action/:id", async (c) => {
  const id = c.req.param("id");
  const moduleUrl = actions[id];
  if (!moduleUrl) {
    return c.text("Not Found", 404);
  }
  if (!hasAction(id)) {
    await import(moduleUrl);
  }
  return executeAction(id, c);
});

app.get("/__eclipsa/loader/:id", async (c) => {
  const id = c.req.param("id");
  const moduleUrl = loaders[id];
  if (!moduleUrl) {
    return c.text("Not Found", 404);
  }
  if (!hasLoader(id)) {
    await import(moduleUrl);
  }
  return executeLoader(id, c);
});

app.all("*", async (c) => {
  const pathname = normalizeRoutePath(new URL(c.req.url).pathname);
  const match = matchRoute(pathname);

  if (!match) {
    const fallback = findSpecialRoute(pathname, "notFound");
    if (fallback?.route?.notFound) {
      return renderRouteResponse(fallback.route, pathname, fallback.params, c, fallback.route.notFound, 404);
    }
    return c.text("Not Found", 404);
  }

  if ((c.req.method === "GET" || c.req.method === "HEAD") && match.route.page) {
    return renderMatchedPage(match, c);
  }
  if (match.route.server) {
    return invokeRouteServer(match.route.server, c, match.params);
  }
  if (match.route.page) {
    return renderMatchedPage(match, c);
  }
  return c.text("Not Found", 404);
});

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
`;
}

export const build = async (builder: ViteBuilder, userConfig: UserConfig) => {
  const root = userConfig.root ?? cwd()
  const actions = await collectAppActions(root)
  const loaders = await collectAppLoaders(root)
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
    renderServer(actions, loaders, routes, routeManifest, symbolUrls),
  )
}
