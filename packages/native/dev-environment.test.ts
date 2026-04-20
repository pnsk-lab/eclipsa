import { describe, expect, it, vi } from 'vitest'
import { handleNativeRpcRequest } from './dev-environment.ts'

describe('handleNativeRpcRequest', () => {
  it('does not expose internal fetchModule errors to the client', async () => {
    const logger = {
      error: vi.fn(),
    }
    const environment = {
      config: {
        resolve: {
          builtins: [],
        },
      },
      fetchModule: vi.fn(async () => {
        throw new Error('secret stack trace')
      }),
      logger,
    }

    const request = new Request('http://native.invalid/rpc', {
      method: 'POST',
      body: JSON.stringify({
        data: ['/entry.ts'],
        name: 'fetchModule',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    const response = await handleNativeRpcRequest(
      environment as Parameters<typeof handleNativeRpcRequest>[0],
      request,
    )
    const body = (await response.json()) as {
      error: {
        message: string
      }
    }

    expect(response.status).toBe(500)
    expect(body.error.message).toBe('Internal native RPC failure.')
    expect(logger.error).toHaveBeenCalledWith('secret stack trace')
  })
})
