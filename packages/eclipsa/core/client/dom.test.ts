import { describe, expect, it, vi } from 'vitest'
import { attr, createComponent } from './dom.ts'
import { __eclipsaComponent } from '../internal.ts'
import { createDetachedRuntimeSignal, type RuntimeContainer } from '../runtime.ts'
import { Suspense } from '../suspense.ts'

const createContainer = () =>
  ({
    actionStates: new Map(),
    actions: new Map(),
    asyncSignalSnapshotCache: new Map(),
    asyncSignalStates: new Map(),
    atoms: new WeakMap(),
    components: new Map(),
    dirty: new Set(),
    dirtyFlushQueued: false,
    eventDispatchPromise: null,
    id: 'rt-client-dom-test',
    imports: new Map(),
    interactivePrefetchCheckQueued: false,
    loaderStates: new Map(),
    loaders: new Map(),
    nextAtomId: 0,
    nextComponentId: 0,
    nextElementId: 0,
    nextScopeId: 0,
    nextSignalId: 0,
    pendingSuspensePromises: new Set(),
    resumeReadyPromise: null,
    rootChildCursor: 0,
    router: null,
    scopes: new Map(),
    signals: new Map(),
    symbols: new Map(),
    visibilityCheckQueued: false,
    visibilityListenersCleanup: null,
    visibles: new Map(),
    watches: new Map(),
  }) as RuntimeContainer

describe('core/client dom attr', () => {
  it('applies class with setAttribute so svg elements can be rerendered', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/2000/svg',
      setAttribute,
    }

    Object.defineProperty(elem, 'className', {
      configurable: true,
      get() {
        return {
          baseVal: '',
        }
      },
    })

    expect(() => attr(elem as unknown as Element, 'class', () => 'icon icon-active')).not.toThrow()
    expect(setAttribute).toHaveBeenCalledWith('class', 'icon icon-active')
  })

  it('applies svg attributes with setAttribute instead of readonly DOM properties', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/2000/svg',
      setAttribute,
    }

    Object.defineProperty(elem, 'viewBox', {
      configurable: true,
      get() {
        return {
          baseVal: null,
        }
      },
    })

    expect(() => attr(elem as unknown as Element, 'viewBox', () => '0 0 24 24')).not.toThrow()
    expect(setAttribute).toHaveBeenCalledWith('viewBox', '0 0 24 24')
  })

  it('assigns signal refs without stringifying them into attributes', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute,
    }
    const ref = createDetachedRuntimeSignal(
      createContainer(),
      's0',
      undefined as Element | undefined,
    )

    attr(elem as unknown as Element, 'ref', () => ref)

    expect(ref.value).toBe(elem)
    expect(setAttribute).not.toHaveBeenCalledWith('ref', expect.anything())
  })

  it('assigns dangerouslySetInnerHTML via the DOM property', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      innerHTML: '',
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute,
    }

    attr(elem as unknown as Element, 'dangerouslySetInnerHTML', () => '<span>raw</span>')

    expect(elem.innerHTML).toBe('<span>raw</span>')
    expect(setAttribute).not.toHaveBeenCalledWith('dangerouslySetInnerHTML', expect.anything())
  })

  it('preserves string style attributes for svg rerenders', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/2000/svg',
      setAttribute,
    }

    attr(
      elem as unknown as Element,
      'style',
      () => 'display:inline;opacity:0.5;fill:url(#linearGradient3);fill-opacity:1',
    )

    expect(setAttribute).toHaveBeenCalledWith(
      'style',
      'display:inline;opacity:0.5;fill:url(#linearGradient3);fill-opacity:1',
    )
  })

  it('preserves data attributes during client rerenders', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute,
    }

    attr(elem as unknown as Element, 'data-testid', () => 'probe-aa-0')

    expect(setAttribute).toHaveBeenCalledWith('data-testid', 'probe-aa-0')
  })

  it('skips redundant class writes when a reactive class result is unchanged', () => {
    const flag = createDetachedRuntimeSignal(createContainer(), 's0', true)
    let className = ''
    let setCount = 0
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute: vi.fn(),
    }

    Object.defineProperty(elem, 'className', {
      configurable: true,
      get() {
        return className
      },
      set(value: string) {
        className = value
        setCount += 1
      },
    })

    attr(elem as unknown as Element, 'class', () => (flag.value ? 'card' : 'card'))

    expect(className).toBe('card')
    expect(setCount).toBe(1)

    flag.value = false

    expect(className).toBe('card')
    expect(setCount).toBe(1)
  })

  it('preserves suspense components as render objects for runtime fallback handling', () => {
    const rendered = createComponent(Suspense as any, {
      children: ['done'],
      fallback: ['loading'],
    })()

    expect(rendered).toMatchObject({
      props: {
        children: ['done'],
        fallback: ['loading'],
      },
      type: Suspense,
    })
  })

  it('preserves resumable components as render objects so client rerenders keep boundary shape', () => {
    const Child = __eclipsaComponent(
      (_props: { label: string }) => null,
      'component:child',
      () => [],
    )

    const rendered = createComponent(Child as any, {
      label: 'Overview',
    })()

    expect(rendered).toMatchObject({
      props: {
        label: 'Overview',
      },
      type: Child,
    })
  })
})
