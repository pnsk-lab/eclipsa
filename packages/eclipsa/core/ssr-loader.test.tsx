import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { __eclipsaLoader } from './loader.ts'
import { renderSSRAsync } from './ssr.ts'

const useProfile = __eclipsaLoader('profile-ssr', [], async () => ({
  ready: true,
}))

const App = () => {
  const profile = useProfile()
  return <div>{profile.data?.ready ? 'ready' : 'pending'}</div>
}

describe('SSR loader discovery', () => {
  it('resolves component-local loaders during SSR and persists them into the payload', async () => {
    const app = new Hono()

    app.get('/', async (c) => {
      const result = await renderSSRAsync(() => <App />, {
        context: c,
      })
      return c.json(result)
    })

    const response = await app.request('http://localhost/')
    const body = (await response.json()) as {
      html: string
      payload: {
        loaders: Record<string, { data: unknown; error: unknown; loaded: boolean }>
      }
    }

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
