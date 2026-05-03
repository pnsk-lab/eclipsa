import type { EventDescriptor, PackedEventDescriptor } from '../meta.ts'
import { rememberCompiledReactiveDomTarget } from './dom.ts'
import { getRuntimeSymbolUrl } from './kernel.ts'

type RuntimeEventBinder<Container = unknown> = {
  bindLiveClientListener(
    container: Container,
    element: Element,
    eventName: string,
    listener: (event: Event) => unknown,
  ): void
  bindPackedRuntimeEvent(
    container: Container,
    element: Element,
    eventName: string,
    symbol: string,
    captureCount: 0 | 1 | 2 | 3 | 4,
    capture0?: unknown,
    capture1?: unknown,
    capture2?: unknown,
    capture3?: unknown,
  ): void
  bindRuntimeEvent(element: Element, eventName: string, value: unknown): boolean
  dispatchRuntimeEventDescriptor(
    container: Container,
    descriptor: EventDescriptor,
    event: Event,
    currentTarget: Element,
  ): unknown
  findRuntimeContainerForEventTarget(
    target: EventTarget | null,
    fallbackElement?: Element | null,
  ): unknown | null
  getRuntimeContainer(): unknown | null
}

let runtimeEventBinder: RuntimeEventBinder | null = null

export const setRuntimeEventBinder = <Container>(binder: RuntimeEventBinder<Container> | null) => {
  runtimeEventBinder = binder as RuntimeEventBinder | null
}

const capturesFor = (descriptor: EventDescriptor) => {
  if ('captures' in descriptor) {
    return typeof descriptor.captures === 'function' ? descriptor.captures() : descriptor.captures
  }
  const packed = descriptor as PackedEventDescriptor
  switch (packed.captureCount) {
    case 0:
      return []
    case 1:
      return [packed.capture0]
    case 2:
      return [packed.capture0, packed.capture1]
    case 3:
      return [packed.capture0, packed.capture1, packed.capture2]
    case 4:
      return [packed.capture0, packed.capture1, packed.capture2, packed.capture3]
  }
}

const runEventDescriptor = async (descriptor: EventDescriptor, event: Event, elem: Element) => {
  const binder = runtimeEventBinder
  if (binder) {
    const container = binder.findRuntimeContainerForEventTarget(event.target, elem)
    if (container) {
      return binder.dispatchRuntimeEventDescriptor(container, descriptor, event, elem)
    }
  }

  const url = getRuntimeSymbolUrl(descriptor.symbol)
  if (!url) {
    throw new Error(`Unknown resumable event symbol "${descriptor.symbol}".`)
  }
  const module = (await import(/* @vite-ignore */ url)) as { default?: Function }
  if (typeof module.default !== 'function') {
    throw new Error(`Resumable event symbol "${descriptor.symbol}" does not export a function.`)
  }
  const captures = capturesFor(descriptor)
  return module.default(captures, module.default.length >= 2 ? event : undefined)
}

const isEventDescriptor = (value: unknown): value is EventDescriptor =>
  !!value && typeof value === 'object' && typeof (value as EventDescriptor).symbol === 'string'

const bindPackedEvent = (
  elem: Element,
  eventName: string,
  symbol: string,
  captureCount: 0 | 1 | 2 | 3 | 4,
  capture0?: unknown,
  capture1?: unknown,
  capture2?: unknown,
  capture3?: unknown,
) => {
  const binder = runtimeEventBinder
  if (binder) {
    const container = binder.getRuntimeContainer()
    if (container) {
      binder.bindPackedRuntimeEvent(
        container,
        elem,
        eventName,
        symbol,
        captureCount,
        capture0,
        capture1,
        capture2,
        capture3,
      )
      return
    }
  }
  switch (captureCount) {
    case 0:
      eventStatic(elem, eventName, { captureCount, symbol })
      return
    case 1:
      eventStatic(elem, eventName, { capture0, captureCount, symbol })
      return
    case 2:
      eventStatic(elem, eventName, { capture0, capture1, captureCount, symbol })
      return
    case 3:
      eventStatic(elem, eventName, { capture0, capture1, capture2, captureCount, symbol })
      return
    case 4:
      eventStatic(elem, eventName, { capture0, capture1, capture2, capture3, captureCount, symbol })
      return
  }
}

export const eventStatic = Object.assign(
  (elem: Element, eventName: string, value: unknown) => {
    rememberCompiledReactiveDomTarget(elem)
    const binder = runtimeEventBinder
    if (binder) {
      if (binder.bindRuntimeEvent(elem, eventName, value)) {
        return
      }
      const container = binder.getRuntimeContainer()
      if (container && typeof value === 'function') {
        binder.bindLiveClientListener(
          container,
          elem,
          eventName,
          value as (event: Event) => unknown,
        )
        return
      }
    }
    if (typeof value === 'function') {
      elem.addEventListener(eventName, value as EventListener)
      return
    }
    if (isEventDescriptor(value)) {
      elem.addEventListener(eventName, (event) => {
        void runEventDescriptor(value, event, elem)
      })
      return
    }
    throw new Error('Resumable event bindings require a function or descriptor.')
  },
  {
    __0: (elem: Element, eventName: string, symbol: string) => {
      rememberCompiledReactiveDomTarget(elem)
      bindPackedEvent(elem, eventName, symbol, 0)
    },
    __1: (elem: Element, eventName: string, symbol: string, capture0: unknown) => {
      rememberCompiledReactiveDomTarget(elem)
      bindPackedEvent(elem, eventName, symbol, 1, capture0)
    },
    __2: (
      elem: Element,
      eventName: string,
      symbol: string,
      capture0: unknown,
      capture1: unknown,
    ) => {
      rememberCompiledReactiveDomTarget(elem)
      bindPackedEvent(elem, eventName, symbol, 2, capture0, capture1)
    },
    __3: (
      elem: Element,
      eventName: string,
      symbol: string,
      capture0: unknown,
      capture1: unknown,
      capture2: unknown,
    ) => {
      rememberCompiledReactiveDomTarget(elem)
      bindPackedEvent(elem, eventName, symbol, 3, capture0, capture1, capture2)
    },
    __4: (
      elem: Element,
      eventName: string,
      symbol: string,
      capture0: unknown,
      capture1: unknown,
      capture2: unknown,
      capture3: unknown,
    ) => {
      rememberCompiledReactiveDomTarget(elem)
      bindPackedEvent(elem, eventName, symbol, 4, capture0, capture1, capture2, capture3)
    },
  },
)

export const listenerStatic = eventStatic
