import type { Context } from 'hono'
import type { JSX } from '../jsx/types.ts'
import { renderToString } from '../jsx/mod.ts'
import {
  beginAsyncSSRContainer,
  beginSSRContainer,
  collectPendingSuspenseBoundaryIds,
  getResumePayloadScriptContent,
  getStreamingResumeBootstrapScriptContent as getStreamingResumeBootstrapScriptContentFromRuntime,
  toResumePayload,
  toResumePayloadSubset,
  type ResumePayload,
  type RuntimeContainer,
  withRuntimeContainer,
} from './runtime.ts'

export interface SSRRenderResult {
  html: string
  payload: ResumePayload
}

export interface SSRStreamChunk {
  boundaryId: string
  html: string
  payload: ResumePayload
}

export interface SSRStreamRenderResult extends SSRRenderResult {
  chunks: AsyncIterable<SSRStreamChunk>
}

const collectRenderedComponentIdsFromHtml = (html: string) => {
  const ids = new Set<string>()
  const pattern = /<!--ec:c:([^:]+):start-->/g
  for (const match of html.matchAll(pattern)) {
    const id = match[1]
    if (id) {
      ids.add(id)
    }
  }
  return ids
}

const createStreamingResumePayload = (
  container: RuntimeContainer,
  renderedComponentIds: Set<string>,
): ResumePayload => toResumePayloadSubset(container, ['$root', ...renderedComponentIds])

const getPendingSuspensePromises = (container: RuntimeContainer) =>
  collectPendingSuspenseBoundaryIds(container)
    .map((boundaryId) => container.components.get(boundaryId)?.suspensePromise ?? null)
    .filter((promise): promise is Promise<unknown> => !!promise)

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
  const asyncSignalSnapshotCache = new Map<string, unknown>()
  const externalRenderCache = new Map<
    string,
    {
      error?: unknown
      html?: string
      pending?: Promise<string>
      status: 'pending' | 'rejected' | 'resolved'
    }
  >()
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
      {
        asyncSignalSnapshotCache,
        externalRenderCache,
      },
    )

    try {
      const html = withRuntimeContainer(container, () => renderToString(result))
      const pendingSuspensePromises = getPendingSuspensePromises(container)
      if (container.pendingSuspensePromises.size > 0 || pendingSuspensePromises.length > 0) {
        await Promise.allSettled([...container.pendingSuspensePromises, ...pendingSuspensePromises])
        continue
      }
      asyncSignalSnapshotCache.clear()
      return {
        html,
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

const extractBoundaryHtml = (html: string, boundaryId: string) => {
  const startToken = `<!--ec:c:${boundaryId}:start-->`
  const endToken = `<!--ec:c:${boundaryId}:end-->`
  const startIndex = html.indexOf(startToken)
  if (startIndex < 0) {
    return null
  }
  const endIndex = html.indexOf(endToken, startIndex + startToken.length)
  if (endIndex < 0) {
    return null
  }
  return html.slice(startIndex + startToken.length, endIndex)
}

const renderStreamingAttempt = async (
  render: () => JSX.Element | JSX.Element[],
  options: {
    context?: Context<any>
    prepare?: (container: RuntimeContainer) => void | Promise<void>
    resolvePendingLoaders?: (container: RuntimeContainer) => void | Promise<boolean>
    symbols?: Record<string, string>
  },
  seededLoaderStates: Map<string, { data: unknown; error: unknown; loaded: boolean }>,
  asyncSignalSnapshotCache: Map<string, unknown>,
  externalRenderCache: Map<
    string,
    {
      error?: unknown
      html?: string
      pending?: Promise<string>
      status: 'pending' | 'rejected' | 'resolved'
    }
  >,
): Promise<{
  container: RuntimeContainer
  html: string
  payload: ResumePayload
  pendingBoundaryIds: string[]
}> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { container, result } = await beginAsyncSSRContainer(
      options.symbols ?? {},
      render,
      async (runtimeContainer) => {
        for (const [id, snapshot] of seededLoaderStates) {
          runtimeContainer.loaderStates.set(id, {
            data: snapshot.data,
            error: snapshot.error,
            loaded: snapshot.loaded,
          })
        }
        await options.prepare?.(runtimeContainer)
      },
      {
        asyncSignalSnapshotCache,
        externalRenderCache,
      },
    )

    try {
      const html = withRuntimeContainer(container, () => renderToString(result))
      if (container.pendingSuspensePromises.size > 0) {
        await Promise.allSettled(container.pendingSuspensePromises)
        continue
      }
      const renderedComponentIds = collectRenderedComponentIdsFromHtml(html)
      return {
        container,
        html,
        payload: createStreamingResumePayload(container, renderedComponentIds),
        pendingBoundaryIds: collectPendingSuspenseBoundaryIds(container),
      }
    } catch (error) {
      const { isPendingSsrLoaderError, resolvePendingLoaders } = await import('./loader.ts')
      if (!isPendingSsrLoaderError(error)) {
        throw error
      }
      const resolved = options.resolvePendingLoaders
        ? await options.resolvePendingLoaders(container)
        : options.context
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

export const renderSSRStream = async (
  render: () => JSX.Element | JSX.Element[],
  options?: {
    context?: Context<any>
    prepare?: (container: RuntimeContainer) => void | Promise<void>
    resolvePendingLoaders?: (container: RuntimeContainer) => void | Promise<boolean>
    symbols?: Record<string, string>
  },
): Promise<SSRStreamRenderResult> => {
  const asyncSignalSnapshotCache = new Map<string, unknown>()
  const externalRenderCache = new Map<
    string,
    {
      error?: unknown
      html?: string
      pending?: Promise<string>
      status: 'pending' | 'rejected' | 'resolved'
    }
  >()
  const seededLoaderStates = new Map<string, { data: unknown; error: unknown; loaded: boolean }>()
  const initial = await renderStreamingAttempt(
    render,
    options ?? {},
    seededLoaderStates,
    asyncSignalSnapshotCache,
    externalRenderCache,
  )

  if (initial.pendingBoundaryIds.length === 0) {
    asyncSignalSnapshotCache.clear()
    return {
      chunks: (async function* () {})(),
      html: initial.html,
      payload: initial.payload,
    }
  }

  const chunks = (async function* () {
    let current = initial

    try {
      while (current.pendingBoundaryIds.length > 0) {
        await Promise.race(
          current.pendingBoundaryIds.map(
            (boundaryId) =>
              current.container.components.get(boundaryId)?.suspensePromise?.then(
                () => boundaryId,
                () => boundaryId,
              ) ?? Promise.resolve(boundaryId),
          ),
        )

        const next = await renderStreamingAttempt(
          render,
          options ?? {},
          seededLoaderStates,
          asyncSignalSnapshotCache,
          externalRenderCache,
        )

        const nextPending = new Set(next.pendingBoundaryIds)
        const completedIds = current.pendingBoundaryIds
          .filter((boundaryId) => !nextPending.has(boundaryId))
          .sort((left, right) => left.split('.').length - right.split('.').length)

        for (const boundaryId of completedIds) {
          const boundaryHtml = extractBoundaryHtml(next.html, boundaryId)
          if (boundaryHtml === null) {
            continue
          }
          yield {
            boundaryId,
            html: boundaryHtml,
            payload: next.payload,
          }
        }

        current = next
      }
    } finally {
      asyncSignalSnapshotCache.clear()
    }
  })()

  return {
    chunks,
    html: initial.html,
    payload: initial.payload,
  }
}

export const serializeResumePayload = (payload: ResumePayload) =>
  getResumePayloadScriptContent(payload)

export const getStreamingResumeBootstrapScriptContent = () =>
  getStreamingResumeBootstrapScriptContentFromRuntime()
