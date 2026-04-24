import type { Component } from '../component.ts'
import {
  deserializePublicValue,
  serializePublicValue,
  type SerializedReference,
  type SerializedValue,
} from '../hooks.ts'
import {
  getRuntimeContextReference,
  materializeRuntimeContext,
  materializeRuntimeContextProvider,
} from '../context.ts'
import {
  __eclipsaComponent,
  getActionHandleMeta,
  getActionHookMeta,
  getComponentMeta,
  getLazyMeta,
  getLoaderHandleMeta,
  getLoaderHookMeta,
  getNavigateMeta,
  getRegisteredActionHook,
  getRegisteredLoaderHook,
  resolveCaptureValues,
  getSignalMeta,
} from '../meta.ts'
import {
  PROJECTION_SLOT_TYPE,
  RENDER_COMPONENT_TYPE_KEY,
  RENDER_REFERENCE_KIND,
  ROUTE_SLOT_TYPE,
} from './constants.ts'
import type {
  ProjectionSlotValue,
  RenderComponentTypeRef,
  RenderObject,
  RuntimeContainer,
  RuntimeSymbolModule,
  RouteSlotValue,
} from './types.ts'

interface RuntimeSerializationDependencies {
  createProjectionSlot: (
    componentId: string,
    name: string,
    occurrence: number,
    source: unknown,
  ) => ProjectionSlotValue
  ensureRouterState: (container: RuntimeContainer) => {
    navigate: unknown
  }
  ensureRuntimeElementId: (container: RuntimeContainer, element: Element) => string
  evaluateProps: (props: Record<string, unknown>) => Record<string, unknown>
  findRuntimeElement: (container: RuntimeContainer, id: string) => Element | null
  getResolvedRuntimeSymbols: (container: RuntimeContainer) => Map<string, RuntimeSymbolModule>
  isPlainObject: (value: unknown) => value is Record<string, unknown>
  isProjectionSlot: (value: unknown) => value is ProjectionSlotValue
  isRenderObject: (value: unknown) => value is RenderObject
  isRouteSlot: (value: unknown) => value is RouteSlotValue
  loadSymbol: (container: RuntimeContainer, symbol: string) => Promise<unknown>
  materializeComputedSignalReference: (container: RuntimeContainer, signalId: string) => unknown
  materializeScope: (container: RuntimeContainer, scopeId: string) => unknown[]
  materializeSymbolReference: (
    container: RuntimeContainer,
    symbol: string,
    scopeId: string,
  ) => unknown
  registerScope: (container: RuntimeContainer, values: unknown[]) => string
  registerSerializedScope: (container: RuntimeContainer, values: SerializedValue[]) => string
  resolveRenderable: (value: unknown) => unknown
}

export const createRuntimeSerialization = ({
  createProjectionSlot,
  ensureRouterState,
  ensureRuntimeElementId,
  evaluateProps,
  findRuntimeElement,
  getResolvedRuntimeSymbols,
  isPlainObject,
  isProjectionSlot,
  isRenderObject,
  isRouteSlot,
  loadSymbol,
  materializeComputedSignalReference,
  materializeScope,
  materializeSymbolReference,
  registerScope,
  registerSerializedScope,
  resolveRenderable,
}: RuntimeSerializationDependencies) => {
  const getRenderComponentTypeRef = (value: unknown): RenderComponentTypeRef | null => {
    if (typeof value !== 'function') {
      return null
    }
    return (
      ((value as unknown as Record<PropertyKey, unknown>)[RENDER_COMPONENT_TYPE_KEY] as
        | RenderComponentTypeRef
        | undefined) ?? null
    )
  }

  const createMaterializedRenderComponentType = (
    container: RuntimeContainer,
    symbol: string,
    scopeId: string,
  ) => {
    const component = __eclipsaComponent(
      ((props: unknown) => {
        const module = getResolvedRuntimeSymbols(container).get(symbol)
        if (!module) {
          throw new Error(`Missing preloaded render component symbol ${symbol}.`)
        }
        return module.default(materializeScope(container, scopeId), props)
      }) as Component,
      symbol,
      () => materializeScope(container, scopeId),
    )
    Object.defineProperty(component, RENDER_COMPONENT_TYPE_KEY, {
      configurable: true,
      enumerable: false,
      value: {
        scopeId,
        symbol,
      } satisfies RenderComponentTypeRef,
      writable: true,
    })
    return component
  }

  const serializeRenderObjectReference = (
    container: RuntimeContainer,
    value: RenderObject,
  ): SerializedReference => {
    if (typeof value.type === 'function' && !getComponentMeta(value.type)) {
      const resolved = resolveRenderable(value.type(value.props))
      if (!isRenderObject(resolved)) {
        throw new TypeError('Only resumable component render objects can be serialized.')
      }
      return serializeRenderObjectReference(container, resolved)
    }

    const evaluatedProps = evaluateProps(value.props)
    const key = value.key ?? null
    const isStatic = value.isStatic === true
    const metadata = value.metadata ?? null

    if (typeof value.type === 'string') {
      return {
        __eclipsa_type: 'ref',
        data: [
          'element',
          value.type,
          null,
          serializeRuntimeValue(container, evaluatedProps),
          serializeRuntimeValue(container, key),
          isStatic,
          serializeRuntimeValue(container, metadata),
        ],
        kind: RENDER_REFERENCE_KIND,
        token: 'jsx',
      }
    }

    const meta = getComponentMeta(value.type)
    if (!meta) {
      throw new TypeError('Only resumable component render objects can be serialized.')
    }

    return {
      __eclipsa_type: 'ref',
      data: [
        'component',
        meta.symbol,
        registerScope(container, resolveCaptureValues(meta.captures)),
        serializeRuntimeValue(container, evaluatedProps),
        serializeRuntimeValue(container, key),
        isStatic,
        serializeRuntimeValue(container, metadata),
      ],
      kind: RENDER_REFERENCE_KIND,
      token: 'jsx',
    }
  }

  const deserializeRenderObjectReference = (
    container: RuntimeContainer,
    data: SerializedValue | undefined,
  ): RenderObject => {
    if (!Array.isArray(data) || data.length !== 7) {
      throw new TypeError('Render references require a seven-part payload.')
    }

    const [variant, typeValue, scopeValue, propsValue, keyValue, isStaticValue, metadataValue] =
      data
    if (variant !== 'element' && variant !== 'component') {
      throw new TypeError(`Unsupported render reference variant "${String(variant)}".`)
    }
    if (
      typeof isStaticValue !== 'boolean' &&
      isStaticValue !== null &&
      isStaticValue !== undefined
    ) {
      throw new TypeError('Render references require a boolean static flag.')
    }
    const isStatic = isStaticValue === true

    const props = deserializeRuntimeValue(container, propsValue as SerializedValue)
    const key = deserializeRuntimeValue(container, keyValue as SerializedValue)
    const metadata = deserializeRuntimeValue(container, metadataValue as SerializedValue)

    if (!props || typeof props !== 'object') {
      throw new TypeError('Render references require object props.')
    }

    if (variant === 'element') {
      if (typeof typeValue !== 'string') {
        throw new TypeError('Element render references require a string tag name.')
      }
      return {
        isStatic,
        key: (key ?? undefined) as RenderObject['key'],
        metadata: (metadata ?? undefined) as RenderObject['metadata'],
        props: props as Record<string, unknown>,
        type: typeValue,
      }
    }

    if (typeof typeValue !== 'string' || typeof scopeValue !== 'string') {
      throw new TypeError('Component render references require a symbol id and scope id.')
    }

    return {
      isStatic,
      key: (key ?? undefined) as RenderObject['key'],
      metadata: (metadata ?? undefined) as RenderObject['metadata'],
      props: props as Record<string, unknown>,
      type: createMaterializedRenderComponentType(container, typeValue, scopeValue),
    }
  }

  const preloadResumableValue = async (
    container: RuntimeContainer,
    value: unknown,
    seen = new Set<unknown>(),
  ): Promise<void> => {
    if (value === null || value === undefined || value === false) {
      return
    }
    if (seen.has(value)) {
      return
    }
    if (typeof value === 'function') {
      const renderComponentRef = getRenderComponentTypeRef(value)
      if (!renderComponentRef) {
        return
      }
      seen.add(value)
      await loadSymbol(container, renderComponentRef.symbol)
      for (const capturedValue of materializeScope(container, renderComponentRef.scopeId)) {
        await preloadResumableValue(container, capturedValue, seen)
      }
      return
    }
    if (Array.isArray(value)) {
      seen.add(value)
      for (const entry of value) {
        await preloadResumableValue(container, entry, seen)
      }
      return
    }
    if (typeof Node !== 'undefined' && value instanceof Node) {
      return
    }
    if (isProjectionSlot(value)) {
      return
    }
    if (isRenderObject(value)) {
      seen.add(value)
      await preloadResumableValue(container, value.type, seen)
      await preloadResumableValue(container, evaluateProps(value.props), seen)
      return
    }
    if (!isPlainObject(value)) {
      return
    }

    seen.add(value)
    for (const entry of Object.values(value)) {
      await preloadResumableValue(container, entry, seen)
    }
  }

  const serializeRuntimeValue = (container: RuntimeContainer, value: unknown): SerializedValue =>
    serializePublicValue(value, {
      serializeReference(candidate) {
        const signalMeta = getSignalMeta(candidate)
        if (signalMeta) {
          return {
            __eclipsa_type: 'ref',
            kind: signalMeta.kind === 'computed-signal' ? 'computed-signal' : 'signal',
            token: signalMeta.id,
          }
        }
        if (getNavigateMeta(candidate)) {
          return {
            __eclipsa_type: 'ref',
            kind: 'navigate',
            token: 'navigate',
          }
        }
        const actionMeta = getActionHandleMeta(candidate)
        if (actionMeta) {
          return {
            __eclipsa_type: 'ref',
            kind: 'action',
            token: actionMeta.id,
          }
        }
        const actionHookMeta = getActionHookMeta(candidate)
        if (actionHookMeta) {
          return {
            __eclipsa_type: 'ref',
            kind: 'action-hook',
            token: actionHookMeta.id,
          }
        }
        const loaderMeta = getLoaderHandleMeta(candidate)
        if (loaderMeta) {
          return {
            __eclipsa_type: 'ref',
            kind: 'loader',
            token: loaderMeta.id,
          }
        }
        const loaderHookMeta = getLoaderHookMeta(candidate)
        if (loaderHookMeta) {
          return {
            __eclipsa_type: 'ref',
            kind: 'loader-hook',
            token: loaderHookMeta.id,
          }
        }
        const contextReference = getRuntimeContextReference(candidate)
        if (contextReference) {
          return {
            __eclipsa_type: 'ref',
            data: serializeRuntimeValue(container, {
              defaultValue: contextReference.defaultValue,
              hasDefault: contextReference.hasDefault,
            }),
            kind: contextReference.kind,
            token: contextReference.id,
          }
        }
        if (isRouteSlot(candidate)) {
          return {
            __eclipsa_type: 'ref',
            data: serializePublicValue(candidate.startLayoutIndex),
            kind: 'route-slot',
            token: candidate.pathname,
          }
        }
        if (isProjectionSlot(candidate)) {
          return {
            __eclipsa_type: 'ref',
            data: serializeRuntimeValue(container, candidate.source),
            kind: PROJECTION_SLOT_TYPE,
            token: JSON.stringify([candidate.componentId, candidate.name, candidate.occurrence]),
          }
        }
        if (isRenderObject(candidate)) {
          return serializeRenderObjectReference(container, candidate)
        }
        const lazyMeta = getLazyMeta(candidate)
        if (lazyMeta) {
          return {
            __eclipsa_type: 'ref',
            data: resolveCaptureValues(lazyMeta.captures).map((entry) =>
              serializeRuntimeValue(container, entry),
            ),
            kind: 'symbol',
            token: lazyMeta.symbol,
          }
        }
        if (typeof Element !== 'undefined' && candidate instanceof Element) {
          return {
            __eclipsa_type: 'ref',
            kind: 'dom',
            token: ensureRuntimeElementId(container, candidate),
          }
        }
        return null
      },
    })

  const deserializeRuntimeValue = (container: RuntimeContainer, value: SerializedValue): unknown =>
    deserializePublicValue(value, {
      deserializeReference(reference) {
        if (reference.kind === 'navigate') {
          return ensureRouterState(container).navigate
        }
        if (reference.kind === 'action') {
          const action = container.actions.get(reference.token)
          if (!action) {
            throw new Error(`Missing action handle ${reference.token}.`)
          }
          return action
        }
        if (reference.kind === 'action-hook') {
          const actionHook = getRegisteredActionHook(reference.token)
          if (!actionHook) {
            throw new Error(`Missing action hook ${reference.token}.`)
          }
          return actionHook
        }
        if (reference.kind === 'loader') {
          const loader = container.loaders.get(reference.token)
          if (!loader) {
            throw new Error(`Missing loader handle ${reference.token}.`)
          }
          return loader
        }
        if (reference.kind === 'loader-hook') {
          const loaderHook = getRegisteredLoaderHook(reference.token)
          if (!loaderHook) {
            throw new Error(`Missing loader hook ${reference.token}.`)
          }
          return loaderHook
        }
        if (reference.kind === 'context' || reference.kind === 'context-provider') {
          const decoded =
            reference.data === undefined
              ? null
              : (deserializeRuntimeValue(container, reference.data as SerializedValue) as {
                  defaultValue?: unknown
                  hasDefault?: unknown
                } | null)
          const hasDefault = decoded?.hasDefault === true
          const defaultValue = hasDefault ? decoded?.defaultValue : undefined
          const descriptor = {
            defaultValue,
            hasDefault,
            id: reference.token,
          }
          return reference.kind === 'context'
            ? materializeRuntimeContext(descriptor)
            : materializeRuntimeContextProvider(descriptor)
        }
        if (reference.kind === 'route-slot') {
          const startLayoutIndex =
            reference.data === undefined ? 0 : deserializePublicValue(reference.data)
          if (typeof startLayoutIndex !== 'number' || !Number.isInteger(startLayoutIndex)) {
            throw new TypeError('Route slot references require an integer start layout index.')
          }
          return {
            __eclipsa_type: ROUTE_SLOT_TYPE,
            pathname: reference.token,
            startLayoutIndex,
          } satisfies RouteSlotValue
        }
        if (reference.kind === PROJECTION_SLOT_TYPE) {
          let componentId = ''
          let name = ''
          let occurrence = 0
          try {
            const parsed = JSON.parse(reference.token)
            if (
              !Array.isArray(parsed) ||
              parsed.length !== 3 ||
              typeof parsed[0] !== 'string' ||
              typeof parsed[1] !== 'string' ||
              typeof parsed[2] !== 'number'
            ) {
              throw new Error('invalid projection slot token')
            }
            componentId = parsed[0]
            name = parsed[1]
            occurrence = parsed[2]
          } catch {
            throw new TypeError(
              'Projection slot references require a component id, name, and occurrence.',
            )
          }
          return createProjectionSlot(
            componentId,
            name,
            occurrence,
            deserializeRuntimeValue(container, reference.data as SerializedValue),
          )
        }
        if (reference.kind === 'signal') {
          const record = container.signals.get(reference.token)
          if (!record) {
            throw new Error(`Missing signal ${reference.token}.`)
          }
          return record.handle
        }
        if (reference.kind === 'computed-signal') {
          return materializeComputedSignalReference(container, reference.token)
        }
        if (reference.kind === 'symbol') {
          if (!reference.data || !Array.isArray(reference.data)) {
            throw new TypeError('Symbol references require an encoded scope array.')
          }
          const scopeId = registerSerializedScope(container, reference.data)
          return materializeSymbolReference(container, reference.token, scopeId)
        }
        if (reference.kind === RENDER_REFERENCE_KIND) {
          return deserializeRenderObjectReference(container, reference.data)
        }
        if (reference.kind === 'dom') {
          const element = findRuntimeElement(container, reference.token)
          if (!element) {
            throw new Error(`Missing DOM reference ${reference.token}.`)
          }
          return element
        }
        throw new TypeError(`Unsupported runtime reference kind "${reference.kind}".`)
      },
    })

  return {
    deserializeRuntimeValue,
    preloadResumableValue,
    serializeRuntimeValue,
  }
}
