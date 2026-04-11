import { describe, expect, it, vi } from 'vitest'
import { attr, createComponent } from './dom.ts'
import { ACTION_CSRF_COOKIE, ACTION_CSRF_FIELD, ACTION_CSRF_INPUT_ATTR } from '../action-csrf.ts'
import { __eclipsaComponent } from '../internal.ts'
import { ACTION_FORM_ATTR } from '../runtime/constants.ts'
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

  it('injects csrf inputs when action forms are bound on the client', () => {
    class FakeInputElement {
      parentNode: FakeFormElement | null = null
      private readonly attrs = new Map<string, string>()

      getAttribute(name: string) {
        return this.attrs.get(name) ?? null
      }

      setAttribute(name: string, value: string) {
        this.attrs.set(name, value)
      }
    }

    class FakeFormElement {
      firstChild: FakeInputElement | null = null
      namespaceURI = 'http://www.w3.org/1999/xhtml'
      private readonly attrs = new Map<string, string>()
      private csrfInput: FakeInputElement | null = null

      addEventListener = vi.fn()

      getAttribute(name: string) {
        return this.attrs.get(name) ?? null
      }

      insertBefore(node: FakeInputElement, _child: FakeInputElement | null) {
        node.parentNode = this
        this.csrfInput = node
        this.firstChild = node
        return node
      }

      querySelector(selector: string) {
        return selector === `input[${ACTION_CSRF_INPUT_ATTR}]` ? this.csrfInput : null
      }

      removeAttribute(name: string) {
        this.attrs.delete(name)
      }

      setAttribute(name: string, value: string) {
        this.attrs.set(name, value)
      }
    }

    const originalDocument = Reflect.get(globalThis, 'document')
    const originalHTMLFormElement = Reflect.get(globalThis, 'HTMLFormElement')
    const originalHTMLInputElement = Reflect.get(globalThis, 'HTMLInputElement')
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        cookie: `${ACTION_CSRF_COOKIE}=template-token`,
        createElement(tagName: string) {
          if (tagName !== 'input') {
            throw new Error(`Unsupported tag ${tagName}.`)
          }
          return new FakeInputElement()
        },
      },
    })
    Object.defineProperty(globalThis, 'HTMLFormElement', {
      configurable: true,
      value: FakeFormElement,
    })
    Object.defineProperty(globalThis, 'HTMLInputElement', {
      configurable: true,
      value: FakeInputElement,
    })

    try {
      const form = new FakeFormElement()

      attr(form as unknown as Element, ACTION_FORM_ATTR, () => 'sum')

      const input = form.querySelector(`input[${ACTION_CSRF_INPUT_ATTR}]`)
      expect(input).toBeInstanceOf(FakeInputElement)
      expect(input?.getAttribute('name')).toBe(ACTION_CSRF_FIELD)
      expect(input?.getAttribute('value')).toBe('template-token')
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, 'document')
      } else {
        Object.defineProperty(globalThis, 'document', {
          configurable: true,
          value: originalDocument,
        })
      }
      if (originalHTMLFormElement === undefined) {
        Reflect.deleteProperty(globalThis, 'HTMLFormElement')
      } else {
        Object.defineProperty(globalThis, 'HTMLFormElement', {
          configurable: true,
          value: originalHTMLFormElement,
        })
      }
      if (originalHTMLInputElement === undefined) {
        Reflect.deleteProperty(globalThis, 'HTMLInputElement')
      } else {
        Object.defineProperty(globalThis, 'HTMLInputElement', {
          configurable: true,
          value: originalHTMLInputElement,
        })
      }
    }
  })
})
