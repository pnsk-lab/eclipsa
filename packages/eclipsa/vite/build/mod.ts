import { toSSG } from 'hono/ssg'
import type { UserConfig, ViteBuilder } from 'vite'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { cwd } from 'node:process'
import { pathToFileURL } from 'node:url'
import type { RouteManifest, RoutePathSegment } from '../../core/router-shared.ts'
import { ROUTE_MANIFEST_ELEMENT_ID } from '../../core/router-shared.ts'
import {
  createBuildModuleUrl,
  createBuildServerModuleUrl,
  createRouteManifest,
  createRoutes,
} from '../utils/routing.ts'
import {
  collectAppActions,
  collectAppLoaders,
  collectAppSymbols,
  createBuildServerActionUrl,
  createBuildServerLoaderUrl,
  createBuildSymbolUrl,
} from '../compiler.ts'
import type { ResolvedEclipsaPluginOptions } from '../options.ts'

const joinHonoPath = (left: string, right: string) => `${left}/${right}`.replaceAll(/\/+/g, '/')

const toPublicAssetUrl = (root: string, filePath: string) =>
  `/${path.relative(root, filePath).split(path.sep).join('/')}`

const collectFiles = async (directory: string): Promise<string[]> => {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      return entry.isDirectory() ? collectFiles(entryPath) : [entryPath]
    }),
  )
  return files.flat()
}

const collectClientStylesheetUrls = async (clientDir: string) => {
  try {
    const files = await collectFiles(clientDir)
    return files
      .filter((filePath) => path.extname(filePath) === '.css')
      .sort()
      .map((filePath) => toPublicAssetUrl(clientDir, filePath))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

export const toHonoRoutePaths = (segments: RoutePathSegment[]) => {
  let paths = ['']

  for (const segment of segments) {
    switch (segment.kind) {
      case 'static':
        paths = paths.map((currentPath) => joinHonoPath(currentPath, segment.value))
        break
      case 'required':
        paths = paths.map((currentPath) => joinHonoPath(currentPath, `:${segment.value}`))
        break
      case 'optional':
        paths = paths.flatMap((currentPath) => [
          currentPath,
          joinHonoPath(currentPath, `:${segment.value}`),
        ])
        break
      case 'rest':
        paths = paths.map((currentPath) => joinHonoPath(currentPath, `:${segment.value}{.+}`))
        break
    }
  }

  return [...new Set(paths.map((currentPath) => (currentPath === '' ? '/' : currentPath)))]
}

const createSerializedRoutes = (routes: Awaited<ReturnType<typeof createRoutes>>) =>
  JSON.stringify(
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

const createActionTable = (actions: Array<{ filePath: string; id: string }>) =>
  actions
    .map(
      (action) =>
        `  ${JSON.stringify(action.id)}: ${JSON.stringify(createBuildServerActionUrl(action.id))},`,
    )
    .join('\n')

const createLoaderTable = (loaders: Array<{ filePath: string; id: string }>) =>
  loaders
    .map(
      (loader) =>
        `  ${JSON.stringify(loader.id)}: ${JSON.stringify(createBuildServerLoaderUrl(loader.id))},`,
    )
    .join('\n')

const createPageRouteEntries = (routes: Awaited<ReturnType<typeof createRoutes>>) =>
  routes.flatMap((route, routeIndex) =>
    route.page
      ? toHonoRoutePaths(route.segments).map((honoPath) => ({
          path: honoPath,
          routeIndex,
        }))
      : [],
  )

const renderAppModule = (
  actions: Array<{ filePath: string; id: string }>,
  loaders: Array<{ filePath: string; id: string }>,
  routes: Awaited<ReturnType<typeof createRoutes>>,
  routeManifest: RouteManifest,
  symbolUrls: Record<string, string>,
  stylesheetUrls: string[],
) => {
  const serializedRoutes = createSerializedRoutes(routes)
  const serializedPageRouteEntries = JSON.stringify(createPageRouteEntries(routes))
  const actionTable = createActionTable(actions)
  const loaderTable = createLoaderTable(loaders)
  const serializedSymbolUrls = JSON.stringify(symbolUrls)
  const serializedRouteManifest = JSON.stringify(routeManifest)
  const serializedStylesheetUrls = JSON.stringify(stylesheetUrls)

  return `import userApp from "./entries/server_entry.mjs";
import SSRRoot from "./entries/ssr_root.mjs";
import { Fragment, escapeJSONScriptText, executeAction, executeLoader, hasAction, hasLoader, jsxDEV, renderSSRAsync, resolvePendingLoaders, serializeResumePayload } from "./entries/eclipsa_runtime.mjs";

const app = userApp;
const actions = {
${actionTable}
};
const loaders = {
${loaderTable}
};
const routes = ${serializedRoutes};
const pageRouteEntries = ${serializedPageRouteEntries};
const routeManifest = ${serializedRouteManifest};
const symbolUrls = ${serializedSymbolUrls};
const stylesheetUrls = ${serializedStylesheetUrls};
const RESUME_PAYLOAD_PLACEHOLDER = ${JSON.stringify('__ECLIPSA_RESUME_PAYLOAD__')};
const ROUTE_MANIFEST_PLACEHOLDER = ${JSON.stringify('__ECLIPSA_ROUTE_MANIFEST__')};
const ROUTE_PARAMS_PROP = "__eclipsa_route_params";

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

const replaceHeadPlaceholder = (html, placeholder, value) => html.replace(placeholder, value);

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
            ...stylesheetUrls.map((href) => ({
              type: "link",
              isStatic: true,
              props: {
                href,
                rel: "stylesheet",
              },
            })),
            {
              type: "script",
              isStatic: true,
              props: {
                children: RESUME_PAYLOAD_PLACEHOLDER,
                id: "eclipsa-resume",
                type: "application/eclipsa-resume+json",
              },
            },
            {
              type: "script",
              isStatic: true,
              props: {
                children: ROUTE_MANIFEST_PLACEHOLDER,
                id: "${ROUTE_MANIFEST_ELEMENT_ID}",
                type: "application/eclipsa-route-manifest+json",
              },
            },
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
  return c.html(
    replaceHeadPlaceholder(
      replaceHeadPlaceholder(html, RESUME_PAYLOAD_PLACEHOLDER, serializeResumePayload(payload)),
      ROUTE_MANIFEST_PLACEHOLDER,
      escapeJSONScriptText(JSON.stringify(routeManifest)),
    ),
    status,
  );
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

for (const pageRouteEntry of pageRouteEntries) {
  app.get(pageRouteEntry.path, async (c) => {
    const pathname = normalizeRoutePath(new URL(c.req.url).pathname);
    const match = matchRoute(pathname);
    if (!match || match.route !== routes[pageRouteEntry.routeIndex]) {
      return c.text("Not Found", 404);
    }
    return renderMatchedPage(match, c);
  });
}

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

export const pageRoutePatterns = [...new Set(pageRouteEntries.map((entry) => entry.path))];
export default app;
`
}

const renderNodeServer = () => `import app from "../ssr/eclipsa_app.mjs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export const build = async (
  builder: ViteBuilder,
  userConfig: UserConfig,
  options: ResolvedEclipsaPluginOptions,
) => {
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

  const clientDir = path.join(root, 'dist/client')
  const stylesheetUrls = await collectClientStylesheetUrls(clientDir)
  const serverDir = path.join(root, 'dist/server')
  const appModulePath = path.join(root, 'dist/ssr/eclipsa_app.mjs')
  await fs.mkdir(path.dirname(appModulePath), { recursive: true })
  await fs.writeFile(
    appModulePath,
    renderAppModule(actions, loaders, routes, routeManifest, symbolUrls, stylesheetUrls),
  )

  if (options.output === 'node') {
    await fs.mkdir(serverDir, { recursive: true })
    await fs.writeFile(path.join(serverDir, 'index.mjs'), renderNodeServer())
    return
  }

  await fs.rm(serverDir, { force: true, recursive: true })

  const {
    default: app,
    pageRoutePatterns,
  } = (await import(`${pathToFileURL(appModulePath).href}?t=${Date.now()}`)) as {
    default: { fetch(request: Request): Promise<Response> }
    pageRoutePatterns: string[]
  }
  const pageRouteSet = new Set(pageRoutePatterns)
  const result = await toSSG(app as any, fs, {
    beforeRequestHook(request: Request) {
      const routePath = new URL(request.url).pathname
      return pageRouteSet.has(routePath) ? request : false
    },
    dir: clientDir,
  })

  if (!result.success) {
    throw result.error ?? new Error('Failed to generate static output.')
  }
}
