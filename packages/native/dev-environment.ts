import type { ChildProcess } from 'node:child_process'
import {
  createFetchableDevEnvironment,
  type FetchableDevEnvironment,
  type ResolvedConfig,
  type ViteDevServer,
} from 'vite'

const DEFAULT_HOST_SHUTDOWN_TIMEOUT_MS = 3_000

export interface NativeFetchableEnvironmentContext {
  ws: ViteDevServer['ws']
}

export interface NativeHostProcess {
  child: ChildProcess
  description: string
}

export interface NativeFetchableEnvironmentOptions {
  launch: boolean
  manifestPath: string
  name: string
  startupTimeoutMs: number
  createHostProcess(context: { manifestPath: string; manifestUrl: string }): NativeHostProcess
  shouldLaunch?(): boolean
}

const normalizeServerHost = (host: string | boolean | undefined) => {
  if (typeof host !== 'string' || host === '0.0.0.0' || host === '::') {
    return '127.0.0.1'
  }
  return host
}

const tryResolveServerOrigin = (server: ViteDevServer, name: string) => {
  const preferredOrigin =
    server.resolvedUrls?.local[0] ??
    server.resolvedUrls?.network[0] ??
    server.config.server.origin ??
    null
  if (preferredOrigin) {
    return preferredOrigin.endsWith('/') ? preferredOrigin : `${preferredOrigin}/`
  }

  if (server.config.server.strictPort && server.config.server.port > 0) {
    const protocol = server.config.server.https ? 'https' : 'http'
    const host = normalizeServerHost(server.config.server.host)
    return `${protocol}://${host}:${server.config.server.port}/`
  }

  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error(`Could not resolve a dev server origin for the ${name} environment.`)
  }

  const protocol = server.config.server.https ? 'https' : 'http'
  const host =
    address.address === '::' || address.address === '0.0.0.0' ? '127.0.0.1' : address.address
  return `${protocol}://${host}:${address.port}/`
}

const waitForServerOrigin = async (
  server: ViteDevServer,
  name: string,
  timeoutMs: number,
  shouldCancel?: () => boolean,
) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (shouldCancel?.()) {
      throw new Error(`Cancelled ${name} host startup.`)
    }
    try {
      return tryResolveServerOrigin(server, name)
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Could not resolve a dev server origin for the ${name} environment.`)
}

const resolveManifestUrl = async (
  server: ViteDevServer,
  name: string,
  manifestPath: string,
  timeoutMs: number,
  shouldCancel?: () => boolean,
) => {
  const origin = await waitForServerOrigin(server, name, timeoutMs, shouldCancel)
  return new URL(manifestPath.slice(1), origin).href
}

const waitForManifest = async (
  manifestUrl: string,
  name: string,
  timeoutMs: number,
  shouldCancel?: () => boolean,
) => {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown = null
  while (Date.now() < deadline) {
    if (shouldCancel?.()) {
      throw new Error(`Cancelled ${name} host startup.`)
    }
    try {
      const response = await fetch(manifestUrl)
      if (response.ok) {
        return
      }
      lastError = new Error(`Received ${response.status} from ${manifestUrl}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(
    `Timed out waiting for the native manifest at ${manifestUrl}.${lastError ? ` ${String(lastError)}` : ''}`,
  )
}

const stopChildProcess = async (child: ChildProcess | null) => {
  if (!child || child.exitCode != null || child.signalCode != null) {
    return
  }

  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeoutId)
      resolve()
    }

    const timeoutId = setTimeout(() => {
      if (child.exitCode == null && child.signalCode == null) {
        child.kill('SIGKILL')
      }
    }, DEFAULT_HOST_SHUTDOWN_TIMEOUT_MS)

    child.once('exit', finish)
    child.kill('SIGTERM')
  })
}

const toSerializableBuiltin = (value: RegExp | string) =>
  typeof value === 'string'
    ? value
    : {
        flags: value.flags,
        source: value.source,
        type: 'regexp' as const,
      }

const createJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    status,
  })

const createTextResponse = (body: string, status: number) => new Response(body, { status })

const INTERNAL_NATIVE_RPC_ERROR_MESSAGE = 'Internal native RPC failure.'

export const handleNativeRpcRequest = async (
  environment: FetchableDevEnvironment,
  request: Request,
): Promise<Response> => {
  if (request.method !== 'POST') {
    return createTextResponse('Method Not Allowed', 405)
  }

  try {
    const payload = (await request.json()) as {
      data?: unknown[]
      name?: string
    }

    switch (payload.name) {
      case 'fetchModule': {
        const [url, importer, options] = payload.data ?? []
        const result = await environment.fetchModule(
          String(url ?? ''),
          importer == null ? undefined : String(importer),
          (options ?? {}) as { cached?: boolean; startOffset?: number },
        )
        return createJsonResponse({ result })
      }
      case 'getBuiltins': {
        const result = environment.config.resolve.builtins.map(toSerializableBuiltin)
        return createJsonResponse({ result })
      }
      default:
        return createJsonResponse(
          {
            error: {
              message: `Unsupported native RPC method: ${String(payload.name ?? '')}`,
            },
          },
          400,
        )
    }
  } catch (error) {
    environment.logger.error(
      error instanceof Error ? error.message : `Native RPC failed: ${String(error)}`,
    )
    return createJsonResponse(
      {
        error: {
          message: INTERNAL_NATIVE_RPC_ERROR_MESSAGE,
        },
      },
      500,
    )
  }
}

export const createNativeFetchableDevEnvironment = (
  config: ResolvedConfig,
  context: NativeFetchableEnvironmentContext,
  options: NativeFetchableEnvironmentOptions,
) => {
  let environment!: FetchableDevEnvironment
  environment = createFetchableDevEnvironment(options.name, config, {
    handleRequest(request) {
      return handleNativeRpcRequest(environment, request)
    },
    hot: true,
    options: config.environments[options.name],
    transport: context.ws,
  })

  const originalListen = environment.listen.bind(environment)
  const originalClose = environment.close.bind(environment)
  let closing = false
  let hostProcess: ChildProcess | null = null
  let startupTask: Promise<void> | null = null

  environment.listen = async (server) => {
    await originalListen(server)
    if (hostProcess || startupTask || !options.launch) {
      return
    }
    if (options.shouldLaunch && !options.shouldLaunch()) {
      return
    }

    startupTask = (async () => {
      const shouldCancel = () => closing
      try {
        const manifestUrl = await resolveManifestUrl(
          server,
          options.name,
          options.manifestPath,
          options.startupTimeoutMs,
          shouldCancel,
        )
        await waitForManifest(manifestUrl, options.name, options.startupTimeoutMs, shouldCancel)
        if (closing) {
          return
        }

        const { child, description } = options.createHostProcess({
          manifestPath: options.manifestPath,
          manifestUrl,
        })
        hostProcess = child

        hostProcess.once('error', (error) => {
          environment.logger.error(
            `Failed to launch the ${options.name} host with "${description}": ${String(error)}`,
          )
        })
        hostProcess.once('exit', (code, signal) => {
          const expectedShutdown = closing && (signal === 'SIGTERM' || signal === 'SIGKILL')
          hostProcess = null
          if (expectedShutdown || code === 0) {
            return
          }
          environment.logger.warn(
            `The ${options.name} host exited unexpectedly${code != null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}.`,
          )
        })
      } catch (error) {
        if (!closing) {
          environment.logger.error(String(error))
        }
      } finally {
        startupTask = null
      }
    })()
  }

  environment.close = async () => {
    closing = true
    try {
      await startupTask
      await stopChildProcess(hostProcess)
      hostProcess = null
      await originalClose()
    } finally {
      closing = false
    }
  }

  return environment
}
