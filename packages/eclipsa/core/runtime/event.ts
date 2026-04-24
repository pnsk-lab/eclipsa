import type { EventDescriptor, PackedEventDescriptor } from '../meta.ts'
import { getRuntimeSymbolUrl } from './kernel.ts'

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

const runEventDescriptor = async (descriptor: EventDescriptor, event: Event) => {
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

export const eventStatic = Object.assign(
  (elem: Element, eventName: string, value: unknown) => {
    if (typeof value === 'function') {
      elem.addEventListener(eventName, value as EventListener)
      return
    }
    if (isEventDescriptor(value)) {
      elem.addEventListener(eventName, (event) => {
        void runEventDescriptor(value, event)
      })
      return
    }
    throw new Error('Resumable event bindings require a function or descriptor.')
  },
  {
    __0: (elem: Element, eventName: string, symbol: string) =>
      eventStatic(elem, eventName, { captureCount: 0, symbol }),
    __1: (elem: Element, eventName: string, symbol: string, capture0: unknown) =>
      eventStatic(elem, eventName, { capture0, captureCount: 1, symbol }),
    __2: (elem: Element, eventName: string, symbol: string, capture0: unknown, capture1: unknown) =>
      eventStatic(elem, eventName, { capture0, capture1, captureCount: 2, symbol }),
    __3: (
      elem: Element,
      eventName: string,
      symbol: string,
      capture0: unknown,
      capture1: unknown,
      capture2: unknown,
    ) => eventStatic(elem, eventName, { capture0, capture1, capture2, captureCount: 3, symbol }),
    __4: (
      elem: Element,
      eventName: string,
      symbol: string,
      capture0: unknown,
      capture1: unknown,
      capture2: unknown,
      capture3: unknown,
    ) =>
      eventStatic(elem, eventName, {
        capture0,
        capture1,
        capture2,
        capture3,
        captureCount: 4,
        symbol,
      }),
  },
)

export const listenerStatic = eventStatic
