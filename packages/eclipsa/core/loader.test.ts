import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { beginAsyncSSRContainer, toResumePayload } from './runtime.ts'
import { executeLoader, primeLoaderState, registerLoader, type LoaderMiddleware } from './loader.ts'

const traceMiddleware: LoaderMiddleware<{
  Variables: {
    traceId: string
  }
}> = async (c, next) => {
  c.set('traceId', 'trace-loader')
  await next()
}

describe('loader runtime', () => {
  it('executes middleware-backed loaders over RPC without client input', async () => {
    const app = new Hono()
    registerLoader('profile', [traceMiddleware], async (c) => ({
      traceId: c.var.traceId,
      value: 42,
    }))

    app.get('/__eclipsa/loader/:id', (c) => executeLoader(c.req.param('id'), c))

    const response = await app.request('http://localhost/__eclipsa/loader/profile')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      value: {
        __eclipsa_type: 'object',
        entries: [
          ['traceId', 'trace-loader'],
          ['value', 42],
        ],
      },
    })
  })

  it('persists preloaded loader state into the resume payload', async () => {
    const app = new Hono()
    registerLoader('preloaded', [], async () => ({ ready: true }))

    app.get('/payload', async (c) => {
      const { container } = await beginAsyncSSRContainer({}, () => null, async (runtimeContainer) => {
        await primeLoaderState(runtimeContainer, 'preloaded', c)
      })
      return c.json(toResumePayload(container))
    })

    const response = await app.request('http://localhost/payload')
    const payload = (await response.json()) as {
      loaders: Record<string, { data: unknown; error: unknown; loaded: boolean }>
    }

    expect(payload.loaders.preloaded).toEqual({
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
