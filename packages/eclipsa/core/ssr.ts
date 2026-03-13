import type { Context } from 'hono'
import type { JSX } from '../jsx/types.ts'
import { renderToString } from '../jsx/mod.ts'
import {
  beginAsyncSSRContainer,
  beginSSRContainer,
  getResumePayloadScriptContent,
  toResumePayload,
  type ResumePayload,
  type RuntimeContainer,
  withRuntimeContainer,
} from './runtime.ts'

export interface SSRRenderResult {
  html: string
  payload: ResumePayload
}

export const renderSSR = (
  render: () => JSX.Element | JSX.Element[],
  options?: {
    symbols?: Record<string, string>
  },
): SSRRenderResult => {
  const { container, result } = beginSSRContainer(options?.symbols ?? {}, render)
  return {
    html: withRuntimeContainer(container, () => renderToString(result)),
    payload: toResumePayload(container),
  }
}

export const renderSSRAsync = async (
  render: () => JSX.Element | JSX.Element[],
  options?: {
    context?: Context<any>
    prepare?: (container: RuntimeContainer) => void | Promise<void>
    resolvePendingLoaders?: (container: RuntimeContainer) => void | Promise<boolean>
    symbols?: Record<string, string>
  },
): Promise<SSRRenderResult> => {
  const seededLoaderStates = new Map<string, { data: unknown; error: unknown; loaded: boolean }>()

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { container, result } = await beginAsyncSSRContainer(
      options?.symbols ?? {},
      render,
      async (runtimeContainer) => {
        for (const [id, snapshot] of seededLoaderStates) {
          runtimeContainer.loaderStates.set(id, {
            data: snapshot.data,
            error: snapshot.error,
            loaded: snapshot.loaded,
          })
        }
        await options?.prepare?.(runtimeContainer)
      },
    )

    try {
      return {
        html: withRuntimeContainer(container, () => renderToString(result)),
        payload: toResumePayload(container),
      }
    } catch (error) {
      const { isPendingSsrLoaderError, resolvePendingLoaders } = await import('./loader.ts')
      if (!isPendingSsrLoaderError(error)) {
        throw error
      }
      const resolved = options?.resolvePendingLoaders
        ? await options.resolvePendingLoaders(container)
        : options?.context
          ? await resolvePendingLoaders(container, options.context)
          : false
      if (!resolved) {
        throw error
      }
      seededLoaderStates.clear()
      for (const [id, snapshot] of container.loaderStates) {
        seededLoaderStates.set(id, {
          data: snapshot.data,
          error: snapshot.error,
          loaded: snapshot.loaded,
        })
      }
    }
  }

  throw new Error('SSR loader resolution did not converge.')
}

export const serializeResumePayload = (payload: ResumePayload) =>
  getResumePayloadScriptContent(payload)
