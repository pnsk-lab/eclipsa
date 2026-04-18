export interface HostObjectReference {
  id: number
}

export interface HostObjectRegistry {
  create(value: unknown): HostObjectReference
  delete(reference: HostObjectReference): boolean
  get(reference: HostObjectReference): unknown
  has(reference: HostObjectReference): boolean
}

export type HostCallback = (...args: readonly unknown[]) => unknown

export interface HostCallbackRegistry {
  get(name: string): HostCallback
  has(name: string): boolean
  invoke(name: string, ...args: readonly unknown[]): unknown
  register(name: string, callback: HostCallback): () => void
}

export interface RuntimeTaskScheduler {
  flush(): void
  queue(task: () => void): void
}

export interface RuntimeModuleRecord {
  code: string
  id: string
}

export interface RuntimeModuleRegistry {
  get(id: string): RuntimeModuleRecord
  has(id: string): boolean
  register(record: RuntimeModuleRecord): void
}

export interface QuickJSRuntimeBridge {
  callbacks: HostCallbackRegistry
  modules: RuntimeModuleRegistry
  scheduler: RuntimeTaskScheduler
  values: HostObjectRegistry
}

export const createHostObjectRegistry = (): HostObjectRegistry => {
  let nextId = 1
  const values = new Map<number, unknown>()
  return {
    create(value) {
      const reference = { id: nextId++ }
      values.set(reference.id, value)
      return reference
    },
    delete(reference) {
      return values.delete(reference.id)
    },
    get(reference) {
      if (!values.has(reference.id)) {
        throw new Error(`Unknown host object reference "${reference.id}".`)
      }
      return values.get(reference.id)
    },
    has(reference) {
      return values.has(reference.id)
    },
  }
}

export const createHostCallbackRegistry = (): HostCallbackRegistry => {
  const callbacks = new Map<string, HostCallback>()
  return {
    get(name) {
      const callback = callbacks.get(name)
      if (!callback) {
        throw new Error(`Unknown host callback "${name}".`)
      }
      return callback
    },
    has(name) {
      return callbacks.has(name)
    },
    invoke(name, ...args) {
      return this.get(name)(...args)
    },
    register(name, callback) {
      callbacks.set(name, callback)
      return () => {
        callbacks.delete(name)
      }
    },
  }
}

export const createRuntimeTaskScheduler = (): RuntimeTaskScheduler => {
  const queue: Array<() => void> = []
  return {
    flush() {
      while (queue.length > 0) {
        const task = queue.shift()
        task?.()
      }
    },
    queue(task) {
      queue.push(task)
    },
  }
}

export const createRuntimeModuleRegistry = (
  records: Iterable<RuntimeModuleRecord> = [],
): RuntimeModuleRegistry => {
  const modules = new Map<string, RuntimeModuleRecord>()
  for (const record of records) {
    modules.set(record.id, record)
  }
  return {
    get(id) {
      const record = modules.get(id)
      if (!record) {
        throw new Error(`Unknown native module "${id}".`)
      }
      return record
    },
    has(id) {
      return modules.has(id)
    },
    register(record) {
      modules.set(record.id, record)
    },
  }
}

export const createQuickJSRuntimeBridge = (
  options: Partial<QuickJSRuntimeBridge> = {},
): QuickJSRuntimeBridge => ({
  callbacks: options.callbacks ?? createHostCallbackRegistry(),
  modules: options.modules ?? createRuntimeModuleRegistry(),
  scheduler: options.scheduler ?? createRuntimeTaskScheduler(),
  values: options.values ?? createHostObjectRegistry(),
})
