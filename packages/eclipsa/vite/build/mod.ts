import { toSSG } from 'hono/ssg'
import type { UserConfig, ViteBuilder } from 'vite'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { cwd } from 'node:process'
import { pathToFileURL } from 'node:url'
import type {
  GetStaticPaths,
  RouteManifest,
  RouteParams,
  RoutePathSegment,
  StaticPath,
} from '../../core/router-shared.ts'
import {
  ROUTE_DATA_ENDPOINT,
  ROUTE_DATA_REQUEST_HEADER,
  ROUTE_MANIFEST_ELEMENT_ID,
  ROUTE_PREFLIGHT_ENDPOINT,
} from '../../core/router-shared.ts'
import {
  createBuildModuleUrl,
  createBuildServerModuleUrl,
  createRouteManifest,
  normalizeRoutePath,
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

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

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

const resolveRouteRenderMode = (
  route: Awaited<ReturnType<typeof createRoutes>>[number],
  output: ResolvedEclipsaPluginOptions['output'],
) => route.renderMode ?? (output === 'ssg' ? 'static' : 'dynamic')

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

interface ResolvedStaticPathInfo {
  concretePath: string
  honoParams: Record<string, string>
  honoPatternPath: string
}

interface ResolvedStaticPrerenderTargets {
  concretePaths: Set<string>
  dynamicParamsByPattern: Map<string, Record<string, string>[]>
}

const createStaticPathsError = (routePath: string, message: string) =>
  new Error(`Invalid getStaticPaths() for route ${routePath}: ${message}`)

const validatePathSegmentValue = (
  routePath: string,
  paramName: string,
  value: string,
  kind: 'optional' | 'required' | 'rest',
) => {
  if (value.length === 0) {
    throw createStaticPathsError(routePath, `${kind} param "${paramName}" must not be empty.`)
  }
  if (value.includes('/')) {
    throw createStaticPathsError(routePath, `${kind} param "${paramName}" must not contain "/".`)
  }
}

export const resolveStaticPathInfo = (
  routePath: string,
  segments: RoutePathSegment[],
  params: RouteParams,
): ResolvedStaticPathInfo => {
  const allowedParams = new Set(
    segments.filter((segment) => segment.kind !== 'static').map((segment) => segment.value),
  )

  for (const key of Object.keys(params)) {
    if (!allowedParams.has(key)) {
      throw createStaticPathsError(routePath, `unknown param "${key}".`)
    }
  }

  const concreteSegments: string[] = []
  const honoPatternSegments: string[] = []
  const honoParams: Record<string, string> = {}

  for (const segment of segments) {
    switch (segment.kind) {
      case 'static':
        concreteSegments.push(segment.value)
        honoPatternSegments.push(segment.value)
        break
      case 'required': {
        const value = params[segment.value]
        if (typeof value !== 'string') {
          throw createStaticPathsError(
            routePath,
            `required param "${segment.value}" must be a string.`,
          )
        }
        validatePathSegmentValue(routePath, segment.value, value, 'required')
        concreteSegments.push(value)
        honoPatternSegments.push(`:${segment.value}`)
        honoParams[segment.value] = value
        break
      }
      case 'optional': {
        const value = params[segment.value]
        if (value === undefined) {
          break
        }
        if (typeof value !== 'string') {
          throw createStaticPathsError(
            routePath,
            `optional param "${segment.value}" must be a string when provided.`,
          )
        }
        validatePathSegmentValue(routePath, segment.value, value, 'optional')
        concreteSegments.push(value)
        honoPatternSegments.push(`:${segment.value}`)
        honoParams[segment.value] = value
        break
      }
      case 'rest': {
        const value = params[segment.value]
        if (!Array.isArray(value)) {
          throw createStaticPathsError(
            routePath,
            `rest param "${segment.value}" must be a string array.`,
          )
        }
        if (value.length === 0) {
          throw createStaticPathsError(
            routePath,
            `rest param "${segment.value}" must contain at least one segment.`,
          )
        }
        for (const part of value) {
          if (typeof part !== 'string') {
            throw createStaticPathsError(
              routePath,
              `rest param "${segment.value}" must only contain strings.`,
            )
          }
          validatePathSegmentValue(routePath, segment.value, part, 'rest')
        }
        concreteSegments.push(...value)
        honoPatternSegments.push(`:${segment.value}{.+}`)
        honoParams[segment.value] = value.join('/')
        break
      }
    }
  }

  return {
    concretePath: normalizeRoutePath(concreteSegments.join('/')),
    honoParams,
    honoPatternPath: normalizeRoutePath(honoPatternSegments.join('/')),
  }
}

const resolveBuiltPageModulePath = (root: string, entryName: string) =>
  path.join(root, 'dist', 'ssr', 'entries', `${entryName}.mjs`)

const loadBuiltGetStaticPaths = async (root: string, entryName: string, routePath: string) => {
  const modulePath = resolveBuiltPageModulePath(root, entryName)
  const mod = (await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`)) as Partial<{
    getStaticPaths: GetStaticPaths
  }>
  if (typeof mod.getStaticPaths !== 'function') {
    throw createStaticPathsError(routePath, 'dynamic static routes must export getStaticPaths().')
  }
  return mod.getStaticPaths
}

const validateStaticPathsResult = (routePath: string, value: unknown): StaticPath[] => {
  if (!Array.isArray(value)) {
    throw createStaticPathsError(routePath, 'getStaticPaths() must return an array.')
  }
  return value as StaticPath[]
}

const resolveStaticPrerenderTargets = async (
  root: string,
  routes: Array<Awaited<ReturnType<typeof createRoutes>>[number]>,
): Promise<ResolvedStaticPrerenderTargets> => {
  const concretePaths = new Set<string>()
  const dynamicParamsByPattern = new Map<string, Record<string, string>[]>()
  const ownersByConcretePath = new Map<string, string>()

  const registerConcretePath = (routePath: string, concretePath: string) => {
    const existingOwner = ownersByConcretePath.get(concretePath)
    if (existingOwner) {
      throw createStaticPathsError(
        routePath,
        `duplicate concrete path "${concretePath}" conflicts with ${existingOwner}.`,
      )
    }
    ownersByConcretePath.set(concretePath, routePath)
  }

  for (const route of routes) {
    if (!route.page) {
      continue
    }

    const hasDynamicSegment = route.segments.some((segment) => segment.kind !== 'static')
    if (!hasDynamicSegment) {
      registerConcretePath(route.routePath, route.routePath)
      concretePaths.add(route.routePath)
      continue
    }

    const getStaticPaths = await loadBuiltGetStaticPaths(
      root,
      route.page.entryName,
      route.routePath,
    )
    const staticPaths = validateStaticPathsResult(route.routePath, await getStaticPaths())

    for (const [index, staticPath] of staticPaths.entries()) {
      if (!staticPath || typeof staticPath !== 'object') {
        throw createStaticPathsError(route.routePath, `entry ${index} must be an object.`)
      }
      if (
        !('params' in staticPath) ||
        !staticPath.params ||
        typeof staticPath.params !== 'object' ||
        Array.isArray(staticPath.params)
      ) {
        throw createStaticPathsError(
          route.routePath,
          `entry ${index} must include a params object.`,
        )
      }

      const resolved = resolveStaticPathInfo(route.routePath, route.segments, staticPath.params)
      registerConcretePath(route.routePath, resolved.concretePath)

      if (resolved.honoPatternPath === resolved.concretePath) {
        concretePaths.add(resolved.concretePath)
        continue
      }

      const params = dynamicParamsByPattern.get(resolved.honoPatternPath) ?? []
      params.push(resolved.honoParams)
      dynamicParamsByPattern.set(resolved.honoPatternPath, params)
    }
  }

  return {
    concretePaths,
    dynamicParamsByPattern,
  }
}

const createSerializedRoutes = (routes: Awaited<ReturnType<typeof createRoutes>>) =>
  JSON.stringify(
    routes.map((route) => ({
      error: route.error ? createBuildServerModuleUrl(route.error) : null,
      layouts: route.layouts.map((layout) => createBuildServerModuleUrl(layout)),
      loading: route.loading ? createBuildServerModuleUrl(route.loading) : null,
      middlewares: route.middlewares.map((middleware) => createBuildServerModuleUrl(middleware)),
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
  appHooksClientUrl: string | null,
  appHooksServerUrl: string | null,
  loaders: Array<{ filePath: string; id: string }>,
  routes: Awaited<ReturnType<typeof createRoutes>>,
  routeManifest: RouteManifest,
  serverHooksUrl: string | null,
  symbolUrls: Record<string, string>,
  stylesheetUrls: string[],
) => {
  const serializedRoutes = createSerializedRoutes(routes)
  const serializedPageRouteEntries = JSON.stringify(createPageRouteEntries(routes))
  const actionTable = createActionTable(actions)
  const loaderTable = createLoaderTable(loaders)
  const serializedAppHooksManifest = JSON.stringify({
    client: appHooksClientUrl,
  })
  const serializedAppHooksServerUrl = JSON.stringify(appHooksServerUrl)
  const serializedSymbolUrls = JSON.stringify(symbolUrls)
  const serializedRouteManifest = JSON.stringify(routeManifest)
  const serializedServerHooksUrl = JSON.stringify(serverHooksUrl)
  const serializedStylesheetUrls = JSON.stringify(stylesheetUrls)

  return `import userApp from "./entries/server_entry.mjs";
import SSRRoot from "./entries/ssr_root.mjs";
import { ACTION_CONTENT_TYPE, APP_HOOKS_ELEMENT_ID, Fragment, RESUME_FINAL_STATE_ELEMENT_ID, attachRequestFetch, composeRouteMetadata, createRequestFetch, deserializePublicValue, escapeJSONScriptText, executeAction, executeLoader, getActionFormSubmissionId, getNormalizedActionInput, getStreamingResumeBootstrapScriptContent, hasAction, hasLoader, jsxDEV, markPublicError, primeActionState, primeLocationState, renderRouteMetadataHead, renderSSRAsync, renderSSRStream, resolvePendingLoaders, resolveReroute, runHandleError, serializeResumePayload, withServerRequestContext } from "./entries/eclipsa_runtime.mjs";

const app = userApp;
const actions = {
${actionTable}
};
const loaders = {
${loaderTable}
};
const routes = ${serializedRoutes};
const pageRouteEntries = ${serializedPageRouteEntries};
const appHooksManifest = ${serializedAppHooksManifest};
const appHooksServerUrl = ${serializedAppHooksServerUrl};
const routeManifest = ${serializedRouteManifest};
const serverHooksUrl = ${serializedServerHooksUrl};
const symbolUrls = ${serializedSymbolUrls};
const stylesheetUrls = ${serializedStylesheetUrls};
const RESUME_PAYLOAD_PLACEHOLDER = ${JSON.stringify('__ECLIPSA_RESUME_PAYLOAD__')};
const APP_HOOKS_PLACEHOLDER = ${JSON.stringify('__ECLIPSA_APP_HOOKS__')};
const ROUTE_MANIFEST_PLACEHOLDER = ${JSON.stringify('__ECLIPSA_ROUTE_MANIFEST__')};
const ROUTE_PARAMS_PROP = "__eclipsa_route_params";
const ROUTE_ERROR_PROP = "__eclipsa_route_error";
const ROUTE_DATA_REQUEST_HEADER = ${JSON.stringify(ROUTE_DATA_REQUEST_HEADER)};
const ROUTE_PREFLIGHT_REQUEST_HEADER = "x-eclipsa-route-preflight";
const hooksPromise = (async () => {
  const appHooks = appHooksServerUrl ? await import(appHooksServerUrl) : {};
  const serverHooks = serverHooksUrl ? await import(serverHooksUrl) : {};
  await serverHooks.init?.();
  return { appHooks, serverHooks };
})();

const normalizeRoutePath = (pathname) => {
  const normalizedPath = pathname.trim() || "/";
  const withLeadingSlash = normalizedPath.startsWith("/") ? normalizedPath : "/" + normalizedPath;
  return withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
};

const getRequestUrl = (request) => {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto");
  if (host) {
    url.host = host;
  }
  if (proto) {
    url.protocol = proto + ":";
  }
  return url;
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
    case "rest": {
      const rest = pathnameSegments.slice(pathIndex);
      if (rest.length === 0) {
        return null;
      }
      return matchSegments(segments, pathnameSegments, segments.length, pathnameSegments.length, {
        ...params,
        [segment.value]: rest,
      });
    }
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

const isRedirectResponse = (response) =>
  !!response &&
  typeof response === "object" &&
  typeof response.status === "number" &&
  !!response.headers &&
  typeof response.headers.get === "function" &&
  response.status >= 300 &&
  response.status < 400 &&
  !!response.headers.get("location");

const toPublicErrorValue = async (hooks, c, error, event) => {
  const publicError = await runHandleError(
    {
      handleError: hooks.handleError,
    },
    {
      context: c,
      error,
      event,
    },
  );
  return markPublicError(error, publicError);
};

const logServerError = (error) => {
  if (error && typeof error === "object" && error.__eclipsa_not_found__ === true) {
    return;
  }
  console.error(error);
};

const prepareRequestContext = (c, hooks) => {
  attachRequestFetch(c, createRequestFetch(c, hooks.handleFetch));
  return c;
};

const reroutePathname = (hooks, request, pathname, baseUrl) =>
  normalizeRoutePath(resolveReroute(hooks.reroute, request, pathname, baseUrl));

const resolveRequest = async (c, handler) => {
  const { appHooks, serverHooks } = await hooksPromise;
  const requestContext = prepareRequestContext(c, serverHooks);
  const execute = (nextContext = requestContext) =>
    withServerRequestContext(
      nextContext,
      {
        handleError: serverHooks.handleError,
        transport: appHooks.transport,
      },
      () => handler(nextContext, appHooks, serverHooks),
    );

  if (!serverHooks.handle) {
    return execute(requestContext);
  }

  return withServerRequestContext(
    requestContext,
    {
      handleError: serverHooks.handleError,
      transport: appHooks.transport,
    },
    () => serverHooks.handle(requestContext, (nextContext) => execute(nextContext ?? requestContext)),
  );
};

const resolveRequestRoute = (hooks, request, url) => {
  const requestPathname = normalizeRoutePath(new URL(url).pathname);
  const resolvedPathname = reroutePathname(hooks, request, requestPathname, url);
  return {
    match: matchRoute(resolvedPathname),
    requestPathname,
    resolvedPathname,
  };
};

const loadRouteMiddlewares = async (route) =>
  Promise.all(
    route.middlewares.map(async (middlewareUrl) => {
      const mod = await import(middlewareUrl);
      if (typeof mod.default !== "function") {
        throw new TypeError(
          \`Route middleware "\${middlewareUrl}" must default export a middleware function.\`,
        );
      }
      return mod.default;
    }),
  );

const composeRouteMiddlewares = async (route, c, params, handler) => {
  applyRequestParams(c, params);
  const middlewares = await loadRouteMiddlewares(route);
  let index = -1;
  const dispatch = async (nextIndex) => {
    if (nextIndex <= index) {
      throw new Error("Route middleware called next() multiple times.");
    }
    index = nextIndex;
    const middleware = middlewares[nextIndex];
    if (!middleware) {
      return handler();
    }
    let nextResult;
    const result = await middleware(c, async () => {
      nextResult = await dispatch(nextIndex + 1);
    });
    return result !== undefined ? result : nextResult;
  };
  return dispatch(0);
};

const resolvePreflightTarget = (pathname) => {
  const match = matchRoute(pathname);
  if (match?.route?.page) {
    return match;
  }
  if (!match) {
    const fallback = findSpecialRoute(pathname, "notFound");
    if (fallback?.route?.notFound) {
      return fallback;
    }
  }
  return null;
};

const replaceHeadPlaceholder = (html, placeholder, value) => html.replace(placeholder, value);
const splitHtmlForStreaming = (html) => {
  const bodyCloseIndex = html.lastIndexOf("</body>");
  if (bodyCloseIndex >= 0) {
    return {
      prefix: html.slice(0, bodyCloseIndex),
      suffix: html.slice(bodyCloseIndex),
    };
  }
  const htmlCloseIndex = html.lastIndexOf("</html>");
  if (htmlCloseIndex >= 0) {
    return {
      prefix: html.slice(0, htmlCloseIndex),
      suffix: html.slice(htmlCloseIndex),
    };
  }
  return {
    prefix: html,
    suffix: "",
  };
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

const attachRouteError = (props, error) => {
  Object.defineProperty(props, ROUTE_ERROR_PROP, {
    configurable: true,
    enumerable: false,
    value: error,
    writable: true,
  });
  return props;
};

const createRouteElement = (pathname, params, Page, Layouts, error) => {
  if (Layouts.length === 0) {
    return jsxDEV(Page, attachRouteError(createRouteProps(params, {}), error), null, false, {});
  }

  const route = {
    error,
    layouts: Layouts.map((renderer) => ({ renderer })),
    page: { renderer: Page },
    params,
    pathname,
  };
  let children = null;
  for (let index = Layouts.length - 1; index >= 0; index -= 1) {
    const Layout = Layouts[index];
    children = jsxDEV(Layout, attachRouteError(createRouteProps(params, { children: createRouteSlot(route, index + 1) }), error), null, false, {});
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

const renderRouteResponse = async (route, pathname, params, c, moduleUrl, status = 200, options) => {
  const [pageModule, ...layoutModules] = await Promise.all([
    import(moduleUrl),
    ...route.layouts.map((layout) => import(layout)),
  ]);
  const Page = pageModule.default;
  const Layouts = layoutModules.map((module) => module.default);
  const metadata = composeRouteMetadata(
    [...layoutModules.map((module) => module.metadata ?? null), pageModule.metadata ?? null],
    {
      params,
      url: getRequestUrl(c.req.raw),
    },
  );
  const document = SSRRoot({
    children: createRouteElement(pathname, params, Page, Layouts, options?.routeError),
    head: {
      type: Fragment,
      isStatic: true,
        props: {
          children: [
            ...renderRouteMetadataHead(metadata),
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
                children: APP_HOOKS_PLACEHOLDER,
                id: APP_HOOKS_ELEMENT_ID,
                type: "application/eclipsa-app-hooks+json",
              },
            },
            {
              type: "script",
              isStatic: true,
              props: {
                dangerouslySetInnerHTML: getStreamingResumeBootstrapScriptContent(),
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
  const { html, payload, chunks } = await renderSSRStream(() => document, {
    prepare(container) {
      primeLocationState(container, getRequestUrl(c.req.raw));
      return options?.prepare?.(container);
    },
    resolvePendingLoaders: async (container) => resolvePendingLoaders(container, c),
    symbols: symbolUrls,
  });
  const shellHtml = replaceHeadPlaceholder(
    replaceHeadPlaceholder(
      replaceHeadPlaceholder(html, RESUME_PAYLOAD_PLACEHOLDER, serializeResumePayload(payload)),
      ROUTE_MANIFEST_PLACEHOLDER,
      escapeJSONScriptText(JSON.stringify(routeManifest)),
    ),
    APP_HOOKS_PLACEHOLDER,
    escapeJSONScriptText(JSON.stringify(appHooksManifest)),
  );
  const { prefix, suffix } = splitHtmlForStreaming(shellHtml);
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(prefix));
        void (async () => {
          let latestPayload = payload;

          for await (const chunk of chunks) {
            latestPayload = chunk.payload;
            const templateId = "eclipsa-suspense-template-" + chunk.boundaryId;
            const payloadId = "eclipsa-suspense-payload-" + chunk.boundaryId;
            controller.enqueue(
              encoder.encode(
                "<template id=\\"" + templateId + "\\">" + chunk.html + "</template>" +
                  "<script id=\\"" + payloadId + "\\" type=\\"application/eclipsa-resume+json\\">" + serializeResumePayload(chunk.payload) + "</script>" +
                  "<script>window.__eclipsa_stream.enqueue({boundaryId:" + JSON.stringify(chunk.boundaryId) + ",payloadScriptId:" + JSON.stringify(payloadId) + ",templateId:" + JSON.stringify(templateId) + "})</script>",
              ),
            );
          }

          controller.enqueue(
            encoder.encode(
              "<script id=\\"" + RESUME_FINAL_STATE_ELEMENT_ID + "\\" type=\\"application/eclipsa-resume+json\\">" + serializeResumePayload(latestPayload) + "</script>" + suffix,
            ),
          );
          controller.close();
        })().catch((error) => {
          controller.error(error);
        });
      },
    }),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
      status,
    },
  );
};

const renderMatchedPage = async (match, c, options) => {
  const { appHooks, serverHooks } = await hooksPromise;
  const requestUrl = getRequestUrl(c.req.raw);
  const pathname = normalizeRoutePath(requestUrl.pathname);
  const resolvedPathname = reroutePathname(appHooks, c.req.raw, pathname, requestUrl.href);
  try {
    return await renderRouteResponse(match.route, pathname, match.params, c, match.route.page, 200, options);
  } catch (error) {
    logServerError(error);
    const publicError = await toPublicErrorValue(serverHooks, c, error, "page");
    const fallback = isNotFoundError(error) ? findSpecialRoute(resolvedPathname, "notFound") : findSpecialRoute(resolvedPathname, "error");
    const kind = isNotFoundError(error) ? "notFound" : "error";
    const moduleUrl = fallback?.route?.[kind];
    if (!fallback || !moduleUrl) {
      return c.text(isNotFoundError(error) ? "Not Found" : "Internal Server Error", isNotFoundError(error) ? 404 : 500);
    }
    return renderRouteResponse(fallback.route, pathname, fallback.params, c, moduleUrl, isNotFoundError(error) ? 404 : 500, {
      ...options,
      routeError: publicError,
    });
  }
};

const renderRouteDataResponse = async (route, pathname, params, c, moduleUrl, kind) => {
  const [pageModule, ...layoutModules] = await Promise.all([
    import(moduleUrl),
    ...route.layouts.map((layout) => import(layout)),
  ]);
  const Page = pageModule.default;
  const Layouts = layoutModules.map((module) => module.default);

  applyRequestParams(c, params);
  const { payload } = await renderSSRAsync(() => createRouteElement(pathname, params, Page, Layouts, undefined), {
    prepare(container) {
      primeLocationState(container, getRequestUrl(c.req.raw));
    },
    resolvePendingLoaders: async (container) => resolvePendingLoaders(container, c),
    symbols: symbolUrls,
  });

  return c.json({
    finalHref: getRequestUrl(c.req.raw).href,
    finalPathname: pathname,
    kind,
    loaders: payload.loaders,
    ok: true,
  });
};

const renderRouteData = async (route, pathname, params, c, moduleUrl, kind) => {
  const { appHooks } = await hooksPromise;
  const requestUrl = getRequestUrl(c.req.raw);
  const requestPathname = normalizeRoutePath(requestUrl.pathname);
  const resolvedPathname = reroutePathname(appHooks, c.req.raw, requestPathname, requestUrl.href);
  try {
    return await renderRouteDataResponse(route, pathname, params, c, moduleUrl, kind);
  } catch (error) {
    if (!isNotFoundError(error)) {
      return c.json({ document: true, ok: false });
    }
    const fallback = findSpecialRoute(resolvedPathname, "notFound");
    if (!fallback?.route?.notFound) {
      return c.json({ document: true, ok: false });
    }
    try {
      return await renderRouteDataResponse(
        fallback.route,
        requestPathname,
        fallback.params,
        c,
        fallback.route.notFound,
        "not-found",
      );
    } catch {
      return c.json({ document: true, ok: false });
    }
  }
};

const resolveRouteData = async (href, c) => {
  const requestUrl = getRequestUrl(c.req.raw);
  const targetUrl = new URL(href, requestUrl);
  if (targetUrl.origin !== requestUrl.origin) {
    return c.json({ document: true, ok: false });
  }
  const headers = new Headers(c.req.raw.headers);
  headers.set(ROUTE_DATA_REQUEST_HEADER, "1");
  const response = await app.fetch(
    new Request(targetUrl.href, {
      headers,
      method: "GET",
      redirect: "manual",
    }),
  );
  if (response.status >= 200 && response.status < 300) {
    return response;
  }
  if (isRedirectResponse(response)) {
    return c.json({
      location: new URL(response.headers.get("location"), requestUrl).href,
      ok: false,
    });
  }
  return c.json({ document: true, ok: false });
};

const resolveRoutePreflight = async (href, c) => {
  const { appHooks } = await hooksPromise;
  const requestUrl = getRequestUrl(c.req.raw);
  const targetUrl = new URL(href, requestUrl);
  if (targetUrl.origin !== requestUrl.origin) {
    return c.json({ document: true, ok: false });
  }

  const target = resolvePreflightTarget(reroutePathname(appHooks, new Request(targetUrl.href), normalizeRoutePath(targetUrl.pathname), targetUrl.href));
  if (!target) {
    return c.json({ ok: true });
  }

  const headers = new Headers(c.req.raw.headers);
  headers.set(ROUTE_PREFLIGHT_REQUEST_HEADER, "1");
  let response;
  try {
    response = await c.var.fetch(targetUrl.href, {
      headers,
      redirect: "manual",
    });
  } catch {
    response = await app.fetch(
      new Request(targetUrl.href, {
        headers,
        method: "GET",
        redirect: "manual",
      }),
    );
  }

  if (response.status >= 200 && response.status < 300) {
    return c.json({ ok: true });
  }
  if (isRedirectResponse(response)) {
    return c.json({
      location: new URL(response.headers.get("location"), requestUrl).href,
      ok: false,
    });
  }
  return c.json({ document: true, ok: false });
};

for (const pageRouteEntry of pageRouteEntries) {
  app.get(pageRouteEntry.path, async (c) => {
    const pathname = normalizeRoutePath(getRequestUrl(c.req.raw).pathname);
    const match = matchRoute(pathname);
    if (!match || match.route !== routes[pageRouteEntry.routeIndex]) {
      return c.text("Not Found", 404);
    }
    return composeRouteMiddlewares(
      match.route,
      c,
      match.params,
      async () =>
        c.req.header(ROUTE_PREFLIGHT_REQUEST_HEADER) === "1"
          ? c.body(null, 204)
          : c.req.header(ROUTE_DATA_REQUEST_HEADER) === "1"
            ? renderRouteData(match.route, pathname, match.params, c, match.route.page, "page")
            : renderMatchedPage(match, c),
    );
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

app.get(${JSON.stringify(ROUTE_PREFLIGHT_ENDPOINT)}, async (c) => {
  const href = c.req.query("href");
  if (!href) {
    return c.json({ document: true, ok: false }, 400);
  }
  return resolveRoutePreflight(href, c);
});

app.get(${JSON.stringify(ROUTE_DATA_ENDPOINT)}, async (c) => {
  const href = c.req.query("href");
  if (!href) {
    return c.json({ document: true, ok: false }, 400);
  }
  return resolveRouteData(href, c);
});

app.all("*", async (c) => {
  const pathname = normalizeRoutePath(getRequestUrl(c.req.raw).pathname);
  const match = matchRoute(pathname);

  if (!match) {
    const fallback = findSpecialRoute(pathname, "notFound");
    if (fallback?.route?.notFound) {
      return composeRouteMiddlewares(
        fallback.route,
        c,
        fallback.params,
        async () =>
          c.req.header(ROUTE_PREFLIGHT_REQUEST_HEADER) === "1"
          ? c.body(null, 204)
          : c.req.header(ROUTE_DATA_REQUEST_HEADER) === "1"
              ? renderRouteData(fallback.route, pathname, fallback.params, c, fallback.route.notFound, "not-found")
              : renderRouteResponse(fallback.route, pathname, fallback.params, c, fallback.route.notFound, 404),
      );
    }
    return c.text("Not Found", 404);
  }

  if ((c.req.method === "GET" || c.req.method === "HEAD") && match.route.page) {
    return composeRouteMiddlewares(
      match.route,
      c,
      match.params,
        async () =>
          c.req.header(ROUTE_PREFLIGHT_REQUEST_HEADER) === "1"
            ? c.body(null, 204)
            : c.req.header(ROUTE_DATA_REQUEST_HEADER) === "1"
              ? renderRouteData(match.route, pathname, match.params, c, match.route.page, "page")
              : renderMatchedPage(match, c),
    );
  }
  if (c.req.method === "POST" && match.route.page) {
    return composeRouteMiddlewares(
      match.route,
      c,
      match.params,
      async () => {
        const actionId = await getActionFormSubmissionId(c);
        if (!actionId) {
          return match.route.server
            ? invokeRouteServer(match.route.server, c, match.params)
            : renderMatchedPage(match, c);
        }
        const moduleUrl = actions[actionId];
        if (!moduleUrl) {
          return c.text("Not Found", 404);
        }
        if (!hasAction(actionId)) {
          await import(moduleUrl);
        }
        const input = await getNormalizedActionInput(c);
        const response = await executeAction(actionId, c);
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.startsWith(ACTION_CONTENT_TYPE)) {
          return response;
        }
        const body = await response.json();
        return renderMatchedPage(match, c, {
          prepare(container) {
            primeActionState(container, actionId, {
              error: body.ok ? undefined : deserializeValue(body.error),
              input,
              result: body.ok ? deserializeValue(body.value) : undefined,
            });
          },
        });
      },
    );
  }
  if (match.route.server) {
    return composeRouteMiddlewares(match.route, c, match.params, async () =>
      invokeRouteServer(match.route.server, c, match.params),
    );
  }
  if (match.route.page) {
    return composeRouteMiddlewares(
      match.route,
      c,
      match.params,
      async () =>
        c.req.header(ROUTE_PREFLIGHT_REQUEST_HEADER) === "1"
          ? c.body(null, 204)
          : renderMatchedPage(match, c),
    );
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
  const appHooksPath = path.join(root, 'app/+hooks.ts')
  const serverHooksPath = path.join(root, 'app/+hooks.server.ts')
  const actions = await collectAppActions(root)
  const loaders = await collectAppLoaders(root)
  const routes = await createRoutes(root)
  const staticPageRoutes = routes.filter(
    (route) => route.page && resolveRouteRenderMode(route, options.output) === 'static',
  )
  const dynamicPageRoutes = routes.filter(
    (route) => route.page && resolveRouteRenderMode(route, options.output) === 'dynamic',
  )
  if (options.output === 'ssg') {
    const dynamicRoute = dynamicPageRoutes[0]
    if (dynamicRoute) {
      throw new Error(
        `Route ${dynamicRoute.routePath} is marked render = "dynamic", which is not supported with output "ssg". Switch the app output to "node" or mark the route as "static".`,
      )
    }
    const routeWithMiddleware = routes.find((route) => route.middlewares.length > 0)
    if (routeWithMiddleware) {
      throw new Error(
        `Route middleware is not supported with output "ssg". Remove +middleware.ts from route ${routeWithMiddleware.routePath} or switch to output "node".`,
      )
    }
  }
  const routeManifest = createRouteManifest(routes, createBuildModuleUrl)
  const symbols = await collectAppSymbols(root)
  const symbolUrls = Object.fromEntries(
    symbols.map((symbol) => [symbol.id, createBuildSymbolUrl(symbol.id)]),
  )

  await builder.build(builder.environments.client)
  await builder.build(builder.environments.ssr)

  const appHooksClientUrl = (await fileExists(appHooksPath))
    ? createBuildModuleUrl({ entryName: 'app_hooks', filePath: appHooksPath })
    : null
  const appHooksServerUrl = (await fileExists(appHooksPath))
    ? createBuildServerModuleUrl({ entryName: 'app_hooks', filePath: appHooksPath })
    : null
  const clientDir = path.join(root, 'dist/client')
  const serverHooksUrl = (await fileExists(serverHooksPath))
    ? createBuildServerModuleUrl({ entryName: 'server_hooks', filePath: serverHooksPath })
    : null
  const stylesheetUrls = await collectClientStylesheetUrls(clientDir)
  const serverDir = path.join(root, 'dist/server')
  const appModulePath = path.join(root, 'dist/ssr/eclipsa_app.mjs')
  await fs.mkdir(path.dirname(appModulePath), { recursive: true })
  await fs.writeFile(
    appModulePath,
    renderAppModule(
      actions,
      appHooksClientUrl,
      appHooksServerUrl,
      loaders,
      routes,
      routeManifest,
      serverHooksUrl,
      symbolUrls,
      stylesheetUrls,
    ),
  )
  const staticPrerenderTargets = await resolveStaticPrerenderTargets(root, staticPageRoutes)

  const prerenderStaticRoutes = async () => {
    if (
      staticPrerenderTargets.concretePaths.size === 0 &&
      staticPrerenderTargets.dynamicParamsByPattern.size === 0
    ) {
      return
    }

    const { default: app } = (await import(
      `${pathToFileURL(appModulePath).href}?t=${Date.now()}`
    )) as {
      default: { fetch(request: Request): Promise<Response> }
    }
    const result = await toSSG(app as any, fs, {
      beforeRequestHook(request: Request) {
        const routePath = normalizeRoutePath(decodeURIComponent(new URL(request.url).pathname))
        if (
          routePath === normalizeRoutePath(ROUTE_DATA_ENDPOINT) ||
          routePath === normalizeRoutePath(ROUTE_PREFLIGHT_ENDPOINT) ||
          routePath.startsWith('/__eclipsa/loader/')
        ) {
          return false
        }
        const ssgParams = staticPrerenderTargets.dynamicParamsByPattern.get(routePath)
        if (ssgParams) {
          ;(request as Request & { ssgParams?: Record<string, string>[] }).ssgParams = ssgParams
          return request
        }
        return staticPrerenderTargets.concretePaths.has(routePath) ? request : false
      },
      dir: clientDir,
    })

    if (!result.success) {
      throw result.error ?? new Error('Failed to generate static output.')
    }
  }

  if (options.output === 'node') {
    await prerenderStaticRoutes()
    await fs.mkdir(serverDir, { recursive: true })
    await fs.writeFile(path.join(serverDir, 'index.mjs'), renderNodeServer())
    return
  }

  await fs.rm(serverDir, { force: true, recursive: true })
  await prerenderStaticRoutes()
}
