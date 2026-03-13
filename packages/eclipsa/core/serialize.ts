export interface SerializedUndefined {
  __eclipsa_type: 'undefined'
}

export interface SerializedObject {
  __eclipsa_type: 'object'
  entries: [string, SerializedValue][]
}

export interface SerializedMap {
  __eclipsa_type: 'map'
  entries: [SerializedValue, SerializedValue][]
}

export interface SerializedSet {
  __eclipsa_type: 'set'
  entries: SerializedValue[]
}

export interface SerializedReference {
  __eclipsa_type: 'ref'
  data?: SerializedValue
  kind: string
  token: string
}

export type SerializedValue =
  | SerializedUndefined
  | SerializedObject
  | SerializedMap
  | SerializedSet
  | SerializedReference
  | null
  | boolean
  | number
  | string
  | SerializedValue[]

export interface SerializeValueOptions {
  maxDepth?: number
  maxEntries?: number
  serializeReference?: (value: unknown) => SerializedReference | null
}

export interface DeserializeValueOptions {
  deserializeReference?: (value: SerializedReference) => unknown
  maxDepth?: number
  maxEntries?: number
}

const DEFAULT_MAX_DEPTH = 64
const DEFAULT_MAX_ENTRIES = 10_000

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const assertSafeEntryBudget = (count: number, maxEntries: number) => {
  if (count > maxEntries) {
    throw new RangeError(`Serialized value exceeds the maximum entry budget of ${maxEntries}.`)
  }
}

const assertSafeDepth = (depth: number, maxDepth: number) => {
  if (depth > maxDepth) {
    throw new RangeError(`Serialized value exceeds the maximum depth of ${maxDepth}.`)
  }
}

const assertSafeObject = (value: Record<string, unknown>) => {
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const symbolKeys = Object.getOwnPropertySymbols(value)
  if (symbolKeys.length > 0) {
    throw new TypeError('Objects with symbol keys cannot be serialized.')
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if ('get' in descriptor || 'set' in descriptor) {
      throw new TypeError(`Objects with accessors cannot be serialized (${key}).`)
    }
  }
}

const defineDecodedProperty = (target: Record<string, unknown>, key: string, value: unknown) => {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  })
}

const assertReferenceShape = (value: SerializedReference) => {
  const keys = Object.keys(value).sort()
  const allowedKeys =
    value.data === undefined
      ? ['__eclipsa_type', 'kind', 'token']
      : ['__eclipsa_type', 'data', 'kind', 'token']
  if (keys.length !== allowedKeys.length || keys.some((key, index) => key !== allowedKeys[index])) {
    throw new TypeError('Malformed serialized reference.')
  }
  if (typeof value.kind !== 'string' || value.kind.length === 0) {
    throw new TypeError('Serialized references require a non-empty kind.')
  }
  if (typeof value.token !== 'string' || value.token.length === 0) {
    throw new TypeError('Serialized references require a non-empty token.')
  }
}

const serializeUnknown = (
  value: unknown,
  state: {
    entryCount: number
    maxDepth: number
    maxEntries: number
    serializeReference?: (value: unknown) => SerializedReference | null
  },
  stack: Set<object>,
  depth: number,
): SerializedValue => {
  assertSafeDepth(depth, state.maxDepth)

  const reference = state.serializeReference?.(value) ?? null
  if (reference) {
    state.entryCount += 1
    assertSafeEntryBudget(state.entryCount, state.maxEntries)
    return reference
  }

  if (value === undefined) {
    state.entryCount += 1
    assertSafeEntryBudget(state.entryCount, state.maxEntries)
    return {
      __eclipsa_type: 'undefined',
    }
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    state.entryCount += 1
    assertSafeEntryBudget(state.entryCount, state.maxEntries)
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Non-finite numbers cannot be serialized.')
    }
    state.entryCount += 1
    assertSafeEntryBudget(state.entryCount, state.maxEntries)
    return value
  }
  if (typeof value === 'function') {
    throw new TypeError('Functions cannot be serialized.')
  }
  if (typeof value === 'symbol') {
    throw new TypeError('Symbols cannot be serialized.')
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported primitive ${typeof value}.`)
  }
  if (value instanceof Promise) {
    throw new TypeError('Promises cannot be serialized.')
  }
  if (value instanceof WeakMap || value instanceof WeakSet) {
    throw new TypeError('Weak collections cannot be serialized.')
  }
  if (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof URL ||
    value instanceof Error ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  ) {
    throw new TypeError(`Unsupported object ${Object.prototype.toString.call(value)}.`)
  }
  if (stack.has(value)) {
    throw new TypeError('Circular values cannot be serialized.')
  }

  stack.add(value)
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new TypeError('Sparse arrays cannot be serialized.')
        }
      }
      state.entryCount += value.length + 1
      assertSafeEntryBudget(state.entryCount, state.maxEntries)
      return value.map((entry) => serializeUnknown(entry, state, stack, depth + 1))
    }
    if (value instanceof Map) {
      state.entryCount += value.size * 2 + 1
      assertSafeEntryBudget(state.entryCount, state.maxEntries)
      const entries: [SerializedValue, SerializedValue][] = []
      for (const [key, entry] of value.entries()) {
        entries.push([
          serializeUnknown(key, state, stack, depth + 1),
          serializeUnknown(entry, state, stack, depth + 1),
        ])
      }
      return {
        __eclipsa_type: 'map',
        entries,
      }
    }
    if (value instanceof Set) {
      state.entryCount += value.size + 1
      assertSafeEntryBudget(state.entryCount, state.maxEntries)
      return {
        __eclipsa_type: 'set',
        entries: [...value].map((entry) => serializeUnknown(entry, state, stack, depth + 1)),
      }
    }
    if (isPlainObject(value)) {
      assertSafeObject(value)
      const descriptors = Object.entries(value)
      state.entryCount += descriptors.length + 1
      assertSafeEntryBudget(state.entryCount, state.maxEntries)
      return {
        __eclipsa_type: 'object',
        entries: descriptors.map(([key, entry]) => [
          key,
          serializeUnknown(entry, state, stack, depth + 1),
        ]),
      }
    }

    throw new TypeError(`Unsupported object ${Object.prototype.toString.call(value)}.`)
  } finally {
    stack.delete(value)
  }
}

const deserializeUnknown = (
  value: SerializedValue,
  state: {
    deserializeReference?: (value: SerializedReference) => unknown
    entryCount: number
    maxDepth: number
    maxEntries: number
  },
  depth: number,
): unknown => {
  assertSafeDepth(depth, state.maxDepth)

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    state.entryCount += 1
    assertSafeEntryBudget(state.entryCount, state.maxEntries)
    return value
  }
  if (Array.isArray(value)) {
    state.entryCount += value.length + 1
    assertSafeEntryBudget(state.entryCount, state.maxEntries)
    return value.map((entry) => deserializeUnknown(entry, state, depth + 1))
  }
  if (!value || typeof value !== 'object' || typeof value.__eclipsa_type !== 'string') {
    throw new TypeError('Malformed serialized value.')
  }

  switch (value.__eclipsa_type) {
    case 'undefined':
      state.entryCount += 1
      assertSafeEntryBudget(state.entryCount, state.maxEntries)
      return undefined
    case 'object': {
      const keys = Object.keys(value).sort()
      if (keys.length !== 2 || keys[0] !== '__eclipsa_type' || keys[1] !== 'entries') {
        throw new TypeError('Malformed serialized object.')
      }
      if (!Array.isArray(value.entries)) {
        throw new TypeError('Serialized object entries must be an array.')
      }
      state.entryCount += value.entries.length + 1
      assertSafeEntryBudget(state.entryCount, state.maxEntries)
      const result: Record<string, unknown> = Object.create(null)
      for (const entry of value.entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
          throw new TypeError('Malformed serialized object entry.')
        }
        const [key, child] = entry
        if (RESERVED_KEYS.has(key)) {
          defineDecodedProperty(result, key, deserializeUnknown(child, state, depth + 1))
          continue
        }
        defineDecodedProperty(result, key, deserializeUnknown(child, state, depth + 1))
      }
      return result
    }
    case 'map': {
      const keys = Object.keys(value).sort()
      if (keys.length !== 2 || keys[0] !== '__eclipsa_type' || keys[1] !== 'entries') {
        throw new TypeError('Malformed serialized map.')
      }
      if (!Array.isArray(value.entries)) {
        throw new TypeError('Serialized map entries must be an array.')
      }
      state.entryCount += value.entries.length * 2 + 1
      assertSafeEntryBudget(state.entryCount, state.maxEntries)
      const result = new Map<unknown, unknown>()
      for (const entry of value.entries) {
        if (!Array.isArray(entry) || entry.length !== 2) {
          throw new TypeError('Malformed serialized map entry.')
        }
        result.set(
          deserializeUnknown(entry[0], state, depth + 1),
          deserializeUnknown(entry[1], state, depth + 1),
        )
      }
      return result
    }
    case 'set': {
      const keys = Object.keys(value).sort()
      if (keys.length !== 2 || keys[0] !== '__eclipsa_type' || keys[1] !== 'entries') {
        throw new TypeError('Malformed serialized set.')
      }
      if (!Array.isArray(value.entries)) {
        throw new TypeError('Serialized set entries must be an array.')
      }
      state.entryCount += value.entries.length + 1
      assertSafeEntryBudget(state.entryCount, state.maxEntries)
      return new Set(value.entries.map((entry) => deserializeUnknown(entry, state, depth + 1)))
    }
    case 'ref':
      assertReferenceShape(value)
      state.entryCount += 1
      assertSafeEntryBudget(state.entryCount, state.maxEntries)
      if (!state.deserializeReference) {
        throw new TypeError(`Cannot deserialize reference kind "${value.kind}" in this context.`)
      }
      return state.deserializeReference(value)
    default:
      throw new TypeError(
        `Unknown serialized value type "${(value as { __eclipsa_type: string }).__eclipsa_type}".`,
      )
  }
}

export const serializeValue = (value: unknown, options?: SerializeValueOptions): SerializedValue =>
  serializeUnknown(
    value,
    {
      entryCount: 0,
      maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
      maxEntries: options?.maxEntries ?? DEFAULT_MAX_ENTRIES,
      serializeReference: options?.serializeReference,
    },
    new Set<object>(),
    0,
  )

export const deserializeValue = (
  value: SerializedValue,
  options?: DeserializeValueOptions,
): unknown =>
  deserializeUnknown(
    value,
    {
      deserializeReference: options?.deserializeReference,
      entryCount: 0,
      maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
      maxEntries: options?.maxEntries ?? DEFAULT_MAX_ENTRIES,
    },
    0,
  )

export const escapeJSONScriptText = (json: string) =>
  json
    .replaceAll('<', '\\u003C')
    .replaceAll('>', '\\u003E')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')

export const serializeJSONScriptContent = (value: unknown, options?: SerializeValueOptions) =>
  escapeJSONScriptText(JSON.stringify(serializeValue(value, options)))

export const parseSerializedJSON = (json: string): SerializedValue => {
  const parsed = JSON.parse(json) as unknown
  return parsed as SerializedValue
}
