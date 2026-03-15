import { describe, expect, it, vi } from 'vitest'
import { attr } from './dom.ts'
import { createDetachedRuntimeSignal, type RuntimeContainer } from '../runtime.ts'

const createContainer = () =>
  ({
    signals: new Map(),
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
})
