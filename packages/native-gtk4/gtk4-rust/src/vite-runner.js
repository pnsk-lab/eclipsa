const SSR_EXPORTS = '__vite_ssr_exports__'
const SSR_IMPORT_META = '__vite_ssr_import_meta__'
const SSR_IMPORT = '__vite_ssr_import__'
const SSR_DYNAMIC_IMPORT = '__vite_ssr_dynamic_import__'
const SSR_EXPORT_ALL = '__vite_ssr_exportAll__'
const SSR_EXPORT_NAME = '__vite_ssr_exportName__'
const VIRTUAL_NATIVE_DEV_CLIENT = 'virtual:eclipsa-native/dev-client'

const globalState = globalThis
const moduleCache = new Map()

const runtimeManifest = globalState.__eclipsaNativeDevManifest
const runtimeBridge = globalState.__eclipsaNativeRuntime

const normalizeModuleKey = (value) =>
  typeof value === 'string' && value.startsWith('/@id/')
    ? value.slice(5).replace('__x00__', '\0')
    : value

const rewriteRunnerCode = (code) =>
  code
    .replaceAll('await __vite_ssr_import__(', '__vite_ssr_import__(')
    .replaceAll('await __vite_ssr_dynamic_import__(', '__vite_ssr_dynamic_import__(')

const exportAll = (exports, sourceModule) => {
  if (!sourceModule || exports === sourceModule) {
    return
  }
  for (const key of Object.keys(sourceModule)) {
    if (key === 'default' || key === '__esModule' || key in exports) {
      continue
    }
    Object.defineProperty(exports, key, {
      configurable: true,
      enumerable: true,
      get: () => sourceModule[key],
    })
  }
}

const exportName = (exports, name, getter) => {
  Object.defineProperty(exports, name, {
    configurable: true,
    enumerable: true,
    get: getter,
  })
}

const invokeRuntime = (name, data) => {
  const response = JSON.parse(runtimeBridge.invoke(name, JSON.stringify(data)))
  if (response?.error?.message) {
    throw new Error(response.error.message)
  }
  return response.result
}

const createModuleRecord = () => ({
  aliases: new Set(),
  evaluated: false,
  evaluating: false,
  exports: undefined,
  meta: null,
})

const setModuleRecord = (record, ...keys) => {
  for (const key of keys) {
    if (typeof key === 'string' && key.length > 0) {
      moduleCache.set(key, record)
      record.aliases.add(key)
      const normalizedKey = normalizeModuleKey(key)
      if (typeof normalizedKey === 'string' && normalizedKey.length > 0) {
        moduleCache.set(normalizedKey, record)
        record.aliases.add(normalizedKey)
      }
    }
  }
}

const removeModuleRecord = (record) => {
  for (const key of record.aliases) {
    moduleCache.delete(key)
  }
  record.aliases.clear()
}

const findModuleRecord = (key) => {
  const cachedRecord = moduleCache.get(key) ?? moduleCache.get(normalizeModuleKey(key))
  if (cachedRecord) {
    return cachedRecord
  }
  const normalizedKey = normalizeModuleKey(key)
  for (const record of moduleCache.values()) {
    if (
      record.meta?.url === key ||
      record.meta?.id === key ||
      record.meta?.file === key ||
      normalizeModuleKey(record.meta?.url) === normalizedKey ||
      normalizeModuleKey(record.meta?.id) === normalizedKey ||
      normalizeModuleKey(record.meta?.file) === normalizedKey
    ) {
      return record
    }
  }
  return null
}

const invalidateModule = (key) => {
  const record = findModuleRecord(key)
  if (!record) {
    return
  }
  removeModuleRecord(record)
}

const resolveModuleFilename = (moduleInfo, url) => moduleInfo?.file ?? moduleInfo?.id ?? url

const resolveModuleDirname = (filename) => {
  const lastSlash = filename.lastIndexOf('/')
  return lastSlash >= 0 ? filename.slice(0, lastSlash) : filename
}

const createImportMeta = (moduleInfo, url) => {
  const canonicalUrl = moduleInfo?.url ?? url
  const hotOwnerPath = normalizeModuleKey(canonicalUrl)
  const filename = resolveModuleFilename(moduleInfo, canonicalUrl)
  return {
    env: {
      BASE_URL: '/',
      DEV: true,
      MODE: 'development',
      PROD: false,
      SSR: true,
    },
    filename,
    dirname: resolveModuleDirname(filename),
    hot: globalState.__eclipsaNativeCreateHotContext?.(hotOwnerPath),
    resolve(specifier) {
      return specifier
    },
    url: canonicalUrl,
  }
}

const importModule = (url, importer) => {
  const existingRecord = moduleCache.get(url)
  const moduleInfo = invokeRuntime('fetchModule', [
    url,
    importer ?? null,
    {
      cached: Boolean(existingRecord?.meta),
      startOffset: 0,
    },
  ])

  if (moduleInfo?.cache && existingRecord?.evaluated) {
    return existingRecord.exports
  }
  if (moduleInfo?.externalize) {
    throw new Error(`Unsupported external native module: ${moduleInfo.externalize}`)
  }

  const record = existingRecord ?? createModuleRecord()
  record.meta = moduleInfo
  setModuleRecord(record, url, moduleInfo?.id, moduleInfo?.url, moduleInfo?.file)
  if (!moduleInfo?.cache) {
    record.evaluated = false
    record.exports = undefined
  }

  if (record.evaluated || record.evaluating) {
    return record.exports
  }

  if (typeof moduleInfo?.code !== 'string') {
    throw new Error(`Missing transformed code for native module ${url}`)
  }

  const canonicalUrl = moduleInfo?.url ?? url
  const run = new Function(
    SSR_EXPORTS,
    SSR_IMPORT_META,
    SSR_IMPORT,
    SSR_DYNAMIC_IMPORT,
    SSR_EXPORT_ALL,
    SSR_EXPORT_NAME,
    `"use strict";${rewriteRunnerCode(moduleInfo.code)}`,
  )

  record.evaluating = true
  record.exports = Object.create(null)
  Object.defineProperty(record.exports, Symbol.toStringTag, {
    configurable: false,
    enumerable: false,
    value: 'Module',
  })

  try {
    run(
      record.exports,
      createImportMeta(moduleInfo, url),
      (dependency) => importModule(String(dependency), canonicalUrl),
      (dependency) => importModule(String(dependency), canonicalUrl),
      (sourceModule) => exportAll(record.exports, sourceModule),
      (name, getter) => exportName(record.exports, name, getter),
    )
    record.evaluated = true
    return record.exports
  } finally {
    record.evaluating = false
  }
}

globalState.__eclipsaNativeModuleRunner = {
  clearCache() {
    moduleCache.clear()
  },
  importModule,
  invalidateModules(urls) {
    for (const url of urls) {
      invalidateModule(String(url))
    }
  },
}

globalState.__eclipsaBoot = () => {
  if (!runtimeManifest?.entry) {
    throw new Error('Missing native dev manifest entry.')
  }

  importModule(VIRTUAL_NATIVE_DEV_CLIENT, null)
  runtimeBridge.connectHMR((message) => {
    const payload = JSON.parse(String(message ?? '{}'))
    const handlePayload = globalState.__eclipsaNativeHandleHmrPayload
    if (typeof handlePayload !== 'function') {
      return
    }
    Promise.resolve(handlePayload(payload)).catch((error) => {
      console.error(error)
    })
  })
}
