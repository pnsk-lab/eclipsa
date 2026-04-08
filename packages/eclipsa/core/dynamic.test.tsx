import { describe, expect, it } from 'vitest'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import { renderToString } from '../jsx/mod.ts'
import { Dynamic } from './dynamic.ts'

describe('Dynamic', () => {
  it('renders the selected intrinsic element without leaking the component prop', () => {
    expect(
      renderToString(
        jsxDEV(
          Dynamic as never,
          {
            children: 'Save',
            component: 'button',
            type: 'button',
          },
          null,
          false,
          {},
        ),
      ),
    ).toBe('<button type="button">Save</button>')
  })

  it('renders nothing when the selected component is nullish', () => {
    expect(
      renderToString(
        jsxDEV(
          Dynamic as never,
          {
            children: 'Hidden',
            component: undefined,
          },
          null,
          false,
          {},
        ),
      ),
    ).toBe('')
  })
})
