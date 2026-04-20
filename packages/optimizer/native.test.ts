import {
  createNativeJsxTransformOptions,
  emitNativeBootstrapModule,
  emitResolvedNativeMapModule,
  emitNativeRouteModule,
  isNativeJsxLikeRequest,
  isNativeTestLikeRequest,
} from './native.ts'
import { describe, expect, it } from 'vitest'

describe('optimizer native helpers', () => {
  it('detects native JSX modules and test files', () => {
    expect(isNativeJsxLikeRequest('/tmp/app/+page.tsx?direct')).toBe(true)
    expect(isNativeJsxLikeRequest('/tmp/app/+page.ts')).toBe(false)
    expect(isNativeTestLikeRequest('/tmp/pkg/runtime.test.tsx')).toBe(true)
    expect(isNativeTestLikeRequest('/tmp/pkg/runtime.tsx')).toBe(false)
  })

  it('creates JSX transform options for @eclipsa/native', () => {
    expect(createNativeJsxTransformOptions('/tmp/app/+page.tsx', true)).toEqual({
      jsx: {
        development: false,
        importSource: '@eclipsa/native',
        runtime: 'automatic',
      },
    })

    expect(createNativeJsxTransformOptions('/tmp/app/+page.test.tsx', true)).toEqual({
      jsx: {
        development: true,
        importSource: '@eclipsa/native',
        runtime: 'automatic',
      },
    })
  })

  it('emits the native bootstrap module source for production', () => {
    const source = emitNativeBootstrapModule({
      appModuleId: 'virtual:eclipsa-native/app',
    })

    expect(source).toContain('import * as appModule from "virtual:eclipsa-native/app";')
    expect(source).toContain('import "virtual:eclipsa-native/map";')
    expect(source).toContain('import { bootNativeApplication } from "@eclipsa/native/runtime";')
    expect(source).toContain('let currentNativeEntry = resolveNativeEntry(appModule);')
    expect(source).toContain('const updateNativeApplication = (nextAppModule = appModule) => {')
    expect(source).toContain('return mountNativeEntry(currentNativeEntry);')
    expect(source).not.toContain('import.meta.hot')
  })

  it('emits a hot-aware native bootstrap module source for dev', () => {
    const source = emitNativeBootstrapModule({
      appModuleId: 'virtual:eclipsa-native/app',
      hmr: true,
      hmrHelpersImport: '/tmp/eclipsa/dev-client.ts',
    })

    expect(source).toContain('import { applyHotUpdate } from "/tmp/eclipsa/dev-client.ts";')
    expect(source).toContain('import.meta.hot.on("eclipsa:native-map-update", refreshNativeMap);')
    expect(source).toContain('runner.importModule("virtual:eclipsa-native/map", null);')
    expect(source).toContain('globalState.__eclipsaNativeApplyAppUpdate = (nextAppModule) => {')
    expect(source).toContain('globalState.__eclipsaNativeMountedApp?.rerender?.();')
    expect(source).toContain('let currentNativeModule = appModule;')
    expect(source).toContain('let currentNativeHotRegistry = resolveNativeHotRegistry(appModule);')
  })

  it('emits a resolved native map module that merges defaults and app overrides', () => {
    const source = emitResolvedNativeMapModule({
      bindingImport: '@eclipsa/native-swiftui',
      defaultMap: {
        button: 'Button',
        vstack: 'VStack',
      },
      mapFile: '/tmp/app/+native-map.ts',
    })

    expect(source).toContain('import * as nativeBinding from "@eclipsa/native-swiftui";')
    expect(source).toContain('import * as appNativeMapModule from "/tmp/app/+native-map.ts";')
    expect(source).toContain('import { setNativeMap } from "@eclipsa/native/runtime";')
    expect(source).toContain('"button": nativeBinding["Button"]')
    expect(source).toContain('"vstack": nativeBinding["VStack"]')
    expect(source).toContain('const resolvedNativeMap = resolveNativeMap(appNativeMapModule);')
    expect(source).toContain('setNativeMap(resolvedNativeMap);')
    expect(source).not.toContain('import.meta.hot.accept')
  })

  it('emits a native route module source that composes layouts and page via createRouteElement', () => {
    const source = emitNativeRouteModule({
      layoutFiles: ['/tmp/app/+layout.tsx', '/tmp/app/dashboard/+layout.tsx'],
      pageFile: '/tmp/app/dashboard/+page.tsx',
      params: {
        slug: 'overview',
      },
      pathname: '/dashboard',
    })

    expect(source).toContain('import { createRouteElement } from "eclipsa/internal";')
    expect(source).toContain('import NativePage from "/tmp/app/dashboard/+page.tsx";')
    expect(source).toContain('import NativeLayout0 from "/tmp/app/+layout.tsx";')
    expect(source).toContain('import NativeLayout1 from "/tmp/app/dashboard/+layout.tsx";')
    expect(source).toContain('pathname: "/dashboard"')
    expect(source).toContain('"slug":"overview"')
    expect(source).toContain('return createRouteElement(route);')
  })

  it('emits a self-accepting native route module source for dev', () => {
    const source = emitNativeRouteModule({
      hmr: true,
      hmrHelpersImport: '/tmp/eclipsa/dev-client.ts',
      layoutFiles: ['/tmp/app/+layout.tsx'],
      pageFile: '/tmp/app/+page.tsx',
      params: {},
      pathname: '/',
    })

    expect(source).toContain(
      'import { createHotRegistry, defineHotComponent } from "/tmp/eclipsa/dev-client.ts";',
    )
    expect(source).toContain('export const __eclipsa$hotRegistry = createHotRegistry();')
    expect(source).toContain('const HotNativePage = defineHotComponent(NativePage')
    expect(source).toContain('export default NativeRouteAppBase;')
    expect(source).toContain('import.meta.hot.accept((nextModule) => {')
    expect(source).toContain('globalThis.__eclipsaNativeApplyAppUpdate?.(nextModule ?? undefined);')
  })
})
