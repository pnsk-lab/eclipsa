const NATIVE_JSX_IMPORT_SOURCE = '@eclipsa/native'

export interface EmitNativeBootstrapModuleOptions {
  appModuleId: string
  hmr?: boolean
  hmrHelpersImport?: string
  mapModuleId?: string
}

export interface EmitResolvedNativeMapModuleOptions {
  bindingImport: string
  defaultMap?: Record<string, string>
  mapFile?: string | null
}

export interface EmitNativeRouteModuleOptions {
  hmr?: boolean
  hmrHelpersImport?: string
  layoutFiles: string[]
  pageFile: string
  params: Record<string, string | string[] | undefined>
  pathname: string
  routeHelpersImport?: string
}

const stripRequestQuery = (value: string) => value.replace(/[?#].*$/, '')

export const isNativeJsxLikeRequest = (id: string) => {
  const normalized = stripRequestQuery(id)
  return normalized.endsWith('.jsx') || normalized.endsWith('.tsx')
}

export const isNativeTestLikeRequest = (id: string) =>
  /\.(?:test|spec)\.[^./]+$/.test(stripRequestQuery(id).replaceAll('\\', '/'))

export const createNativeJsxTransformOptions = (id: string, isProduction: boolean) => ({
  jsx: {
    development: !isProduction || isNativeTestLikeRequest(id),
    importSource: NATIVE_JSX_IMPORT_SOURCE,
    runtime: 'automatic' as const,
  },
})

export const emitNativeBootstrapModule = ({
  appModuleId,
  hmr = false,
  hmrHelpersImport = 'eclipsa/dev-client',
  mapModuleId = 'virtual:eclipsa-native/map',
}: EmitNativeBootstrapModuleOptions) =>
  [
    `import * as appModule from ${JSON.stringify(appModuleId)};`,
    `import ${JSON.stringify(mapModuleId)};`,
    `import { bootNativeApplication } from ${JSON.stringify(NATIVE_JSX_IMPORT_SOURCE)};`,
    ...(!hmr ? [] : [`import { applyHotUpdate } from ${JSON.stringify(hmrHelpersImport)};`]),
    `const globalState = globalThis;`,
    `const resolveNativeEntry = (value) => value?.default ?? value ?? appModule.default ?? appModule;`,
    ...(!hmr
      ? []
      : [`const resolveNativeHotRegistry = (value) => value?.__eclipsa$hotRegistry ?? null;`]),
    ...(!hmr
      ? [`let currentNativeEntry = resolveNativeEntry(appModule);`]
      : [
          `let currentNativeModule = appModule;`,
          `let currentNativeEntry = resolveNativeEntry(appModule);`,
          `let currentNativeHotRegistry = resolveNativeHotRegistry(appModule);`,
        ]),
    `const mountNativeEntry = (value = currentNativeEntry) => {`,
    `  const mountedApp = globalState.__eclipsaNativeMountedApp;`,
    `  if (mountedApp?.replace) {`,
    `    mountedApp.replace(value);`,
    `    return mountedApp;`,
    `  }`,
    `  mountedApp?.unmount?.();`,
    `  const nextMountedApp = bootNativeApplication(value);`,
    `  globalState.__eclipsaNativeMountedApp = nextMountedApp;`,
    `  return nextMountedApp;`,
    `};`,
    `const updateNativeApplication = (nextAppModule = ${hmr ? 'currentNativeModule' : 'appModule'}) => {`,
    ...(!hmr
      ? [
          `  currentNativeEntry = resolveNativeEntry(nextAppModule);`,
          `  return mountNativeEntry(currentNativeEntry);`,
        ]
      : [
          `  const nextEntry = resolveNativeEntry(nextAppModule);`,
          `  const nextHotRegistry = resolveNativeHotRegistry(nextAppModule);`,
          `  if (!globalState.__eclipsaNativeMountedApp) {`,
          `    currentNativeModule = nextAppModule;`,
          `    currentNativeEntry = nextEntry;`,
          `    currentNativeHotRegistry = nextHotRegistry;`,
          `    return mountNativeEntry(nextEntry);`,
          `  }`,
          `  if (currentNativeHotRegistry && nextHotRegistry && applyHotUpdate(currentNativeHotRegistry, nextHotRegistry) === "updated") {`,
          `    currentNativeModule = {`,
          `      __eclipsa$hotRegistry: currentNativeHotRegistry,`,
          `      default: currentNativeEntry,`,
          `    };`,
          `      globalState.__eclipsaNativeMountedApp?.rerender?.();`,
          `      return globalState.__eclipsaNativeMountedApp;`,
          `  }`,
          `  currentNativeModule = nextAppModule;`,
          `  currentNativeEntry = nextEntry;`,
          `  currentNativeHotRegistry = nextHotRegistry;`,
          `  return mountNativeEntry(nextEntry);`,
        ]),
    `};`,
    ...(!hmr
      ? []
      : [
          `const refreshNativeMap = (payload) => {`,
          `  const runner = globalState.__eclipsaNativeModuleRunner;`,
          `  if (!runner) {`,
          `    return;`,
          `  }`,
          `  const invalidatedModules = [${JSON.stringify(mapModuleId)}];`,
          `  if (payload && typeof payload === "object" && typeof payload.file === "string") {`,
          `    invalidatedModules.push(payload.file);`,
          `  }`,
          `  runner.invalidateModules(invalidatedModules);`,
          `  runner.importModule(${JSON.stringify(mapModuleId)}, null);`,
          `  globalState.__eclipsaNativeMountedApp?.rerender?.();`,
          `};`,
          `if (import.meta.hot) {`,
          `  import.meta.hot.on("eclipsa:native-map-update", refreshNativeMap);`,
          `}`,
          `globalState.__eclipsaNativeApplyAppUpdate = (nextAppModule) => {`,
          `  updateNativeApplication(nextAppModule ?? currentNativeModule);`,
          `};`,
        ]),
    `updateNativeApplication(appModule);`,
    '',
  ].join('\n')

export const emitResolvedNativeMapModule = ({
  bindingImport,
  defaultMap = {},
  mapFile = null,
}: EmitResolvedNativeMapModuleOptions) => {
  const defaultEntries =
    Object.entries(defaultMap).length === 0
      ? '{}'
      : `{\n${Object.entries(defaultMap)
          .map(
            ([alias, exportName]) =>
              `  ${JSON.stringify(alias)}: nativeBinding[${JSON.stringify(exportName)}],`,
          )
          .join('\n')}\n}`

  return [
    `import * as nativeBinding from ${JSON.stringify(bindingImport)};`,
    `import { setNativeMap } from ${JSON.stringify(NATIVE_JSX_IMPORT_SOURCE)};`,
    mapFile
      ? `import * as appNativeMapModule from ${JSON.stringify(mapFile)};`
      : `const appNativeMapModule = {};`,
    `const toPlainNativeMap = (value) => {`,
    `  if (!value || typeof value !== "object") {`,
    `    return {};`,
    `  }`,
    `  const namedEntries = Object.fromEntries(`,
    `    Object.entries(value).filter(([key]) => key !== "__esModule" && key !== "default"),`,
    `  );`,
    `  const defaultEntries =`,
    `    typeof value.default === "object" && value.default !== null ? value.default : {};`,
    `  return { ...defaultEntries, ...namedEntries };`,
    `};`,
    `const defaultNativeMap = ${defaultEntries};`,
    `const resolveNativeMap = (value) => ({ ...defaultNativeMap, ...toPlainNativeMap(value) });`,
    `const resolvedNativeMap = resolveNativeMap(appNativeMapModule);`,
    `setNativeMap(resolvedNativeMap);`,
    `export default resolvedNativeMap;`,
    '',
  ].join('\n')
}

export const emitNativeRouteModule = ({
  hmr = false,
  hmrHelpersImport = 'eclipsa/dev-client',
  layoutFiles,
  pageFile,
  params,
  pathname,
  routeHelpersImport = 'eclipsa/internal',
}: EmitNativeRouteModuleOptions) => {
  const layoutImports = layoutFiles.map(
    (file, index) => `import NativeLayout${index} from ${JSON.stringify(file)};`,
  )
  const layoutEntries = layoutFiles.map(
    (file, index) =>
      `{ renderer: ${hmr ? `HotNativeLayout${index}` : `NativeLayout${index}`}, url: ${JSON.stringify(file)}, metadata: null, symbol: null }`,
  )

  return [
    `import { createRouteElement } from ${JSON.stringify(routeHelpersImport)};`,
    `import NativePage from ${JSON.stringify(pageFile)};`,
    ...layoutImports,
    ...(!hmr
      ? []
      : [
          `import { createHotRegistry, defineHotComponent } from ${JSON.stringify(hmrHelpersImport)};`,
          `export const __eclipsa$hotRegistry = createHotRegistry();`,
          ...layoutFiles.map(
            (_, index) =>
              `const HotNativeLayout${index} = defineHotComponent(NativeLayout${index}, { name: ${JSON.stringify(`layout:${index}`)}, registry: __eclipsa$hotRegistry });`,
          ),
          `const HotNativePage = defineHotComponent(NativePage, { name: "page", registry: __eclipsa$hotRegistry });`,
        ]),
    `const route = Object.freeze({`,
    `  error: null,`,
    `  layouts: [${layoutEntries.join(', ')}],`,
    `  page: { renderer: ${hmr ? 'HotNativePage' : 'NativePage'}, url: ${JSON.stringify(pageFile)}, metadata: null, symbol: null },`,
    `  params: ${JSON.stringify(params)},`,
    `  pathname: ${JSON.stringify(pathname)},`,
    `  render: ${hmr ? 'HotNativePage' : 'NativePage'},`,
    `});`,
    `function NativeRouteAppBase() {`,
    `  return createRouteElement(route);`,
    `}`,
    `export default NativeRouteAppBase;`,
    ...(!hmr
      ? []
      : [
          `if (import.meta.hot) {`,
          `  import.meta.hot.accept((nextModule) => {`,
          `    globalThis.__eclipsaNativeApplyAppUpdate?.(nextModule ?? undefined);`,
          `  });`,
          `}`,
        ]),
    '',
  ].join('\n')
}
