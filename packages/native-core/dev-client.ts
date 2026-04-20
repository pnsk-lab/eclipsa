export interface NativeHotUpdate {
  acceptedPath: string
  firstInvalidatedBy?: string
  invalidates?: string[]
  path: string
  timestamp?: number
  type: 'css-update' | 'js-update'
}

export interface NativeConnectedPayload {
  type: 'connected'
}

export interface NativeCustomPayload {
  data?: unknown
  event: string
  type: 'custom'
}

export interface NativeErrorPayload {
  err: {
    message: string
    stack?: string
  }
  type: 'error'
}

export interface NativeFullReloadPayload {
  path?: string
  triggeredBy?: string
  type: 'full-reload'
}

export interface NativePingPayload {
  type: 'ping'
}

export interface NativePrunePayload {
  paths: string[]
  type: 'prune'
}

export interface NativeUpdatePayload {
  type: 'update'
  updates: NativeHotUpdate[]
}

export type NativeHotPayload =
  | NativeConnectedPayload
  | NativeCustomPayload
  | NativeErrorPayload
  | NativeFullReloadPayload
  | NativePingPayload
  | NativePrunePayload
  | NativeUpdatePayload

export type NativeModuleNamespace = Record<string, unknown> & {
  [Symbol.toStringTag]?: 'Module'
}

export interface NativeModuleRunner {
  clearCache(): void
  importModule(url: string, importer?: string | null): NativeModuleNamespace
  invalidateModules(urls: Iterable<string>): void
}

export interface NativeHMRLogger {
  debug(...message: unknown[]): void
  error(message: Error | string): void
}

export interface NativeHotContext {
  readonly data: Record<string, unknown>
  accept(): void
  accept(callback: (module: NativeModuleNamespace | undefined) => void): void
  accept(dependency: string, callback: (module: NativeModuleNamespace | undefined) => void): void
  accept(
    dependencies: readonly string[],
    callback: (modules: Array<NativeModuleNamespace | undefined>) => void,
  ): void
  acceptExports(
    exportNames: string | readonly string[],
    callback?: (module: NativeModuleNamespace | undefined) => void,
  ): void
  dispose(callback: (data: Record<string, unknown>) => void | Promise<void>): void
  invalidate(message?: string): void
  off(event: string, callback: (payload: unknown) => void): void
  on(event: string, callback: (payload: unknown) => void): void
  prune(callback: (data: Record<string, unknown>) => void | Promise<void>): void
  send(event: string, payload?: unknown): void
}

export interface NativeDevClientRuntime {
  boot(): void
  createHotContext(ownerPath: string): NativeHotContext
  handlePayload(payload: NativeHotPayload): Promise<void>
}

interface HotModuleCallback {
  deps: string[]
  fn: (modules: Array<NativeModuleNamespace | undefined>) => void
}

interface HotModuleRecord {
  callbacks: HotModuleCallback[]
  id: string
}

type ListenerMap = Map<string, Array<(payload: unknown) => void>>

const defaultLogger: NativeHMRLogger = {
  debug(...message) {
    console.log('[vite]', ...message)
  },
  error(message) {
    console.error('[vite]', message)
  },
}

const unwrapViteId = (value: string) =>
  value.startsWith('/@id/') ? value.slice(5).replace('__x00__', '\0') : value

class NativeHMRClient {
  readonly customListenersMap = new Map<string, Array<(payload: unknown) => void>>()
  readonly ctxToListenersMap = new Map<string, ListenerMap>()
  readonly dataMap = new Map<string, Record<string, unknown>>()
  readonly disposeMap = new Map<string, (data: Record<string, unknown>) => void | Promise<void>>()
  readonly hotModulesMap = new Map<string, HotModuleRecord>()
  readonly pruneMap = new Map<string, (data: Record<string, unknown>) => void | Promise<void>>()

  currentFirstInvalidatedBy: string | undefined

  private readonly importUpdatedModule: (update: NativeHotUpdate) => NativeModuleNamespace
  private pendingUpdateQueue = false
  private updateQueue: Array<Promise<(() => void) | undefined>> = []

  constructor(
    readonly logger: NativeHMRLogger,
    importUpdatedModule: (update: NativeHotUpdate) => NativeModuleNamespace,
  ) {
    this.importUpdatedModule = importUpdatedModule
  }

  clear() {
    this.hotModulesMap.clear()
    this.disposeMap.clear()
    this.pruneMap.clear()
    this.dataMap.clear()
    this.customListenersMap.clear()
    this.ctxToListenersMap.clear()
  }

  async notifyListeners(event: string, payload: unknown) {
    const listeners = this.customListenersMap.get(event) ?? []
    await Promise.allSettled(listeners.map(async (listener) => listener(payload)))
  }

  async prunePaths(paths: string[]) {
    await Promise.all(
      paths.map(async (path) => {
        const disposer = this.disposeMap.get(path)
        if (disposer) {
          await disposer(this.dataMap.get(path) ?? {})
        }
      }),
    )
    await Promise.all(
      paths.map(async (path) => {
        const prune = this.pruneMap.get(path)
        if (prune) {
          await prune(this.dataMap.get(path) ?? {})
        }
      }),
    )
  }

  async queueUpdate(payload: NativeHotUpdate) {
    this.updateQueue.push(this.fetchUpdate(payload))
    if (this.pendingUpdateQueue) {
      return
    }

    this.pendingUpdateQueue = true
    await Promise.resolve()
    this.pendingUpdateQueue = false

    const pending = [...this.updateQueue]
    this.updateQueue = []
    ;(await Promise.all(pending)).forEach((applyUpdate) => {
      applyUpdate?.()
    })
  }

  private async fetchUpdate(update: NativeHotUpdate) {
    const { acceptedPath, firstInvalidatedBy, path } = update
    const module = this.hotModulesMap.get(path)
    if (!module) {
      return undefined
    }

    const isSelfUpdate = path === acceptedPath
    const qualifiedCallbacks = module.callbacks.filter(({ deps }) => deps.includes(acceptedPath))
    let fetchedModule: NativeModuleNamespace | undefined

    if (isSelfUpdate || qualifiedCallbacks.length > 0) {
      const disposer = this.disposeMap.get(acceptedPath)
      if (disposer) {
        await disposer(this.dataMap.get(acceptedPath) ?? {})
      }
      try {
        fetchedModule = this.importUpdatedModule(update)
      } catch (error) {
        this.warnFailedUpdate(error, acceptedPath)
      }
    }

    return () => {
      try {
        this.currentFirstInvalidatedBy = firstInvalidatedBy
        for (const { deps, fn } of qualifiedCallbacks) {
          fn(deps.map((dependency) => (dependency === acceptedPath ? fetchedModule : undefined)))
        }
        this.logger.debug('hot updated:', isSelfUpdate ? path : `${acceptedPath} via ${path}`)
      } finally {
        this.currentFirstInvalidatedBy = undefined
      }
    }
  }

  private warnFailedUpdate(error: unknown, path: string) {
    if (error instanceof Error) {
      this.logger.error(error)
      this.logger.error(
        `Failed to reload ${path}. This could be due to syntax errors or importing non-existent modules.`,
      )
      return
    }
    this.logger.error(`Failed to reload ${path}: ${String(error)}`)
  }
}

class NativeHotContextImpl implements NativeHotContext {
  readonly data: Record<string, unknown>
  private readonly newListeners = new Map<string, Array<(payload: unknown) => void>>()

  constructor(
    private readonly client: NativeHMRClient,
    private readonly ownerPath: string,
  ) {
    this.data = client.dataMap.get(ownerPath) ?? {}
    if (!client.dataMap.has(ownerPath)) {
      client.dataMap.set(ownerPath, this.data)
    }

    const moduleRecord = client.hotModulesMap.get(ownerPath)
    if (moduleRecord) {
      moduleRecord.callbacks = []
    }

    const staleListeners = client.ctxToListenersMap.get(ownerPath)
    if (staleListeners) {
      for (const [event, callbacks] of staleListeners) {
        const listeners = client.customListenersMap.get(event)
        if (!listeners) {
          continue
        }
        client.customListenersMap.set(
          event,
          listeners.filter((listener) => !callbacks.includes(listener)),
        )
      }
    }

    client.ctxToListenersMap.set(ownerPath, this.newListeners)
  }

  accept(
    dependencies?:
      | string
      | readonly string[]
      | ((module: NativeModuleNamespace | undefined) => void),
    callback?:
      | ((module: NativeModuleNamespace | undefined) => void)
      | ((modules: Array<NativeModuleNamespace | undefined>) => void),
  ) {
    if (typeof dependencies === 'function' || dependencies == null) {
      this.acceptDependencies([this.ownerPath], ([module]) => {
        dependencies?.(module)
      })
      return
    }
    if (typeof dependencies === 'string') {
      this.acceptDependencies([dependencies], ([module]) => {
        ;(callback as ((module: NativeModuleNamespace | undefined) => void) | undefined)?.(module)
      })
      return
    }
    if (Array.isArray(dependencies)) {
      this.acceptDependencies(
        [...dependencies],
        (callback as ((modules: Array<NativeModuleNamespace | undefined>) => void) | undefined) ??
          (() => undefined),
      )
      return
    }
    throw new Error('invalid hot.accept() usage.')
  }

  acceptExports(
    _exportNames: string | readonly string[],
    callback?: (module: NativeModuleNamespace | undefined) => void,
  ) {
    this.acceptDependencies([this.ownerPath], ([module]) => {
      callback?.(module)
    })
  }

  dispose(callback: (data: Record<string, unknown>) => void | Promise<void>) {
    this.client.disposeMap.set(this.ownerPath, callback)
  }

  invalidate(message?: string) {
    const firstInvalidatedBy = this.client.currentFirstInvalidatedBy ?? this.ownerPath
    void this.client.notifyListeners('vite:invalidate', {
      firstInvalidatedBy,
      message,
      path: this.ownerPath,
    })
    this.client.logger.debug(`invalidate ${this.ownerPath}${message ? `: ${message}` : ''}`)
  }

  off(event: string, callback: (payload: unknown) => void) {
    this.removeFromListeners(this.client.customListenersMap, event, callback)
    this.removeFromListeners(this.newListeners, event, callback)
  }

  on(event: string, callback: (payload: unknown) => void) {
    this.addToListeners(this.client.customListenersMap, event, callback)
    this.addToListeners(this.newListeners, event, callback)
  }

  prune(callback: (data: Record<string, unknown>) => void | Promise<void>) {
    this.client.pruneMap.set(this.ownerPath, callback)
  }

  send(event: string, payload?: unknown) {
    void this.client.notifyListeners(event, payload)
  }

  private acceptDependencies(
    dependencies: string[],
    callback: (modules: Array<NativeModuleNamespace | undefined>) => void,
  ) {
    const moduleRecord = this.client.hotModulesMap.get(this.ownerPath) ?? {
      callbacks: [],
      id: this.ownerPath,
    }
    moduleRecord.callbacks.push({
      deps: dependencies,
      fn: callback,
    })
    this.client.hotModulesMap.set(this.ownerPath, moduleRecord)
  }

  private addToListeners(
    listenersMap: ListenerMap,
    event: string,
    callback: (payload: unknown) => void,
  ) {
    const listeners = listenersMap.get(event) ?? []
    listeners.push(callback)
    listenersMap.set(event, listeners)
  }

  private removeFromListeners(
    listenersMap: ListenerMap,
    event: string,
    callback: (payload: unknown) => void,
  ) {
    const listeners = listenersMap.get(event)
    if (!listeners) {
      return
    }
    const nextListeners = listeners.filter((listener) => listener !== callback)
    if (nextListeners.length === 0) {
      listenersMap.delete(event)
      return
    }
    listenersMap.set(event, nextListeners)
  }
}

export const createNativeDevClientRuntime = ({
  entry,
  logger = defaultLogger,
  runner,
}: {
  entry: string
  logger?: NativeHMRLogger
  runner: NativeModuleRunner
}): NativeDevClientRuntime => {
  const client = new NativeHMRClient(logger, (update) => {
    const invalidatedModules = new Set<string>([update.acceptedPath, update.path])
    if (update.firstInvalidatedBy) {
      invalidatedModules.add(update.firstInvalidatedBy)
    }
    for (const invalidated of update.invalidates ?? []) {
      invalidatedModules.add(invalidated)
    }
    runner.invalidateModules(invalidatedModules)
    return runner.importModule(update.acceptedPath, null)
  })

  return {
    boot() {
      runner.importModule(entry, null)
    },
    createHotContext(ownerPath) {
      return new NativeHotContextImpl(client, ownerPath)
    },
    async handlePayload(payload) {
      switch (payload.type) {
        case 'connected':
          logger.debug('connected.')
          return
        case 'custom':
          await client.notifyListeners(payload.event, payload.data)
          return
        case 'error':
          logger.error(`Internal Server Error\n${payload.err.message}\n${payload.err.stack ?? ''}`)
          return
        case 'full-reload':
          logger.debug('program reload')
          await client.notifyListeners('vite:beforeFullReload', payload)
          client.clear()
          runner.clearCache()
          runner.importModule(entry, null)
          return
        case 'ping':
          return
        case 'prune':
          await client.notifyListeners('vite:beforePrune', payload)
          await client.prunePaths(payload.paths)
          return
        case 'update':
          await client.notifyListeners('vite:beforeUpdate', payload)
          await Promise.all(
            payload.updates.map(async (update) => {
              if (update.type !== 'js-update') {
                logger.error('css hmr is not supported in native runner mode.')
                return
              }
              await client.queueUpdate({
                ...update,
                acceptedPath: unwrapViteId(update.acceptedPath),
                firstInvalidatedBy: update.firstInvalidatedBy
                  ? unwrapViteId(update.firstInvalidatedBy)
                  : undefined,
                invalidates: update.invalidates?.map(unwrapViteId),
                path: unwrapViteId(update.path),
              })
            }),
          )
          await client.notifyListeners('vite:afterUpdate', payload)
          return
      }
    },
  }
}

interface NativeDevManifest {
  entry: string
}

interface NativeDevGlobalState {
  __eclipsaNativeCreateHotContext?: (ownerPath: string) => NativeHotContext
  __eclipsaNativeDevManifest?: NativeDevManifest
  __eclipsaNativeHandleHmrPayload?: (payload: NativeHotPayload) => Promise<void>
  __eclipsaNativeModuleRunner?: NativeModuleRunner
}

export const bootNativeDevClient = () => {
  const globalState = globalThis as NativeDevGlobalState
  const manifest = globalState.__eclipsaNativeDevManifest
  const runner = globalState.__eclipsaNativeModuleRunner

  if (!manifest?.entry) {
    throw new Error('Missing native dev manifest entry.')
  }
  if (!runner) {
    throw new Error(
      'Native module runner is unavailable on globalThis.__eclipsaNativeModuleRunner.',
    )
  }

  const runtime = createNativeDevClientRuntime({
    entry: manifest.entry,
    runner,
  })

  globalState.__eclipsaNativeCreateHotContext = (ownerPath) => runtime.createHotContext(ownerPath)
  globalState.__eclipsaNativeHandleHmrPayload = (payload) => runtime.handlePayload(payload)
  runtime.boot()
}
