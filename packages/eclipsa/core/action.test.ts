import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { executeAction, registerAction, validator, type StandardSchemaV1 } from './action.ts'
import { serializeValue } from './serialize.ts'

const createSchema = <T>(
  validate: (value: unknown) => { issues: readonly { message: string }[] } | { value: T },
): StandardSchemaV1<unknown, T> => ({
  '~standard': {
    types: undefined as unknown as {
      input: unknown
      output: T
    },
    validate,
    vendor: 'test',
    version: 1,
  },
})

const createActionApp = () => {
  const app = new Hono()
  app.post('/__eclipsa/action/:id', (c) => executeAction(c.req.param('id'), c))
  return app
}

describe('action runtime', () => {
  it('validates input and exposes c.var.input', async () => {
    const app = createActionApp()
    registerAction(
      'sum',
      [
        validator(
          createSchema((value) => {
            if (
              value &&
              typeof value === 'object' &&
              typeof (value as Record<string, unknown>).left === 'number' &&
              typeof (value as Record<string, unknown>).right === 'number'
            ) {
              return { value: value as { left: number; right: number } }
            }
            return {
              issues: [{ message: 'invalid' }],
            }
          }),
        ),
      ],
      async (c) => {
        return c.var.input!.left + c.var.input!.right
      },
    )

    const response = await app.request('http://localhost/__eclipsa/action/sum', {
      body: JSON.stringify({
        input: serializeValue({
          left: 2,
          right: 3,
        }),
      }),
      headers: {
        'content-type': 'application/eclipsa-action+json',
      },
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      value: 5,
    })
  })

  it('returns validation errors as structured 400 responses', async () => {
    const app = createActionApp()
    registerAction(
      'invalid',
      [
        validator(
          createSchema(() => ({
            issues: [{ message: 'bad input' }],
          })),
        ),
      ],
      async () => 'never',
    )

    const response = await app.request('http://localhost/__eclipsa/action/invalid', {
      body: JSON.stringify({
        input: serializeValue('nope'),
      }),
      headers: {
        'content-type': 'application/eclipsa-action+json',
      },
      method: 'POST',
    })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: unknown; ok: boolean }
    expect(body.ok).toBe(false)
    expect(body.error).toEqual({
      __eclipsa_type: 'object',
      entries: [
        [
          'issues',
          [
            {
              __eclipsa_type: 'object',
              entries: [['message', 'bad input']],
            },
          ],
        ],
      ],
    })
  })

  it('validates native form submissions by normalizing FormData to objects', async () => {
    const app = createActionApp()
    registerAction(
      'form-sum',
      [
        validator(
          createSchema((value) => {
            if (
              value &&
              typeof value === 'object' &&
              typeof (value as Record<string, unknown>).left === 'string' &&
              typeof (value as Record<string, unknown>).right === 'string'
            ) {
              return {
                value: {
                  left: Number((value as Record<string, unknown>).left),
                  right: Number((value as Record<string, unknown>).right),
                },
              }
            }
            return {
              issues: [{ message: 'invalid form payload' }],
            }
          }),
        ),
      ],
      async (c) => c.var.input!.left + c.var.input!.right,
    )

    const formData = new FormData()
    formData.set('left', '4')
    formData.set('right', '6')

    const response = await app.request('http://localhost/__eclipsa/action/form-sum', {
      body: formData,
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      value: 10,
    })
  })

  it('streams async generators and readable streams with framed payloads', async () => {
    const app = createActionApp()
    registerAction('stream', [], async function* () {
      yield 'a'
      yield 'b'
    })
    registerAction(
      'readable',
      [],
      async () =>
        new ReadableStream<string>({
          start(controller) {
            controller.enqueue('x')
            controller.enqueue('y')
            controller.close()
          },
        }),
    )

    const generatorResponse = await app.request('http://localhost/__eclipsa/action/stream', {
      body: JSON.stringify({
        input: serializeValue(null),
      }),
      headers: {
        'content-type': 'application/eclipsa-action+json',
      },
      method: 'POST',
    })
    expect(generatorResponse.headers.get('content-type')).toContain(
      'application/eclipsa-action-stream+json',
    )
    expect(generatorResponse.headers.get('x-eclipsa-stream-kind')).toBe('async-generator')
    await expect(generatorResponse.text()).resolves.toContain('"type":"chunk"')

    const readableResponse = await app.request('http://localhost/__eclipsa/action/readable', {
      body: JSON.stringify({
        input: serializeValue(null),
      }),
      headers: {
        'content-type': 'application/eclipsa-action+json',
      },
      method: 'POST',
    })
    expect(readableResponse.headers.get('x-eclipsa-stream-kind')).toBe('readable-stream')
    await expect(readableResponse.text()).resolves.toContain('"type":"done"')
  })

  it('round-trips opaque action references through server execution', async () => {
    const app = createActionApp()
    registerAction(
      'opaque',
      [
        validator(
          createSchema((value) => ({
            value,
          })),
        ),
      ],
      async (c) => c.var.input,
    )

    const response = await app.request('http://localhost/__eclipsa/action/opaque', {
      body: JSON.stringify({
        input: {
          __eclipsa_type: 'ref',
          data: serializeValue({
            container: 'rt1',
          }),
          kind: 'signal',
          token: 's0',
        },
      }),
      headers: {
        'content-type': 'application/eclipsa-action+json',
      },
      method: 'POST',
    })

    expect(await response.json()).toEqual({
      ok: true,
      value: {
        __eclipsa_type: 'ref',
        data: {
          __eclipsa_type: 'object',
          entries: [['container', 'rt1']],
        },
        kind: 'signal',
        token: 's0',
      },
    })
  })
})
