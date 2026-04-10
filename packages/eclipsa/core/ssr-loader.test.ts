import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { __eclipsaLoader } from './loader.ts'
import { renderSSRAsync } from './ssr.ts'
const useProfile = __eclipsaLoader('profile-ssr', [], async () => ({
  ready: true,
}))
const App = () => {
  const profile = useProfile()
  return /* @__PURE__ */ jsxDEV(
    'div',
    { children: profile.data?.ready ? 'ready' : 'pending' },
    void 0,
    false,
    {
      fileName: 'packages/eclipsa/core/ssr-loader.test.ts',
      lineNumber: 12,
      columnNumber: 10,
    },
  )
}
describe('SSR loader discovery', () => {
  it('resolves component-local loaders during SSR and persists them into the payload', async () => {
    const app = new Hono()
    app.get('/', async (c) => {
      const result = await renderSSRAsync(
        () =>
          /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
            fileName: 'packages/eclipsa/core/ssr-loader.test.ts',
            lineNumber: 20,
            columnNumber: 49,
          }),
        {
          context: c,
        },
      )
      return c.json(result)
    })
    const response = await app.request('http://localhost/')
    const body = await response.json()
    expect(body.html).toContain('ready')
    expect(body.payload.loaders['profile-ssr']).toEqual({
      data: {
        __eclipsa_type: 'object',
        entries: [['ready', true]],
      },
      error: {
        __eclipsa_type: 'undefined',
      },
      loaded: true,
    })
  })
})
