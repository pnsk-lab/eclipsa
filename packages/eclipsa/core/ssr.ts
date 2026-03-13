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
    prepare?: (container: RuntimeContainer) => void | Promise<void>
    symbols?: Record<string, string>
  },
): Promise<SSRRenderResult> => {
  const { container, result } = await beginAsyncSSRContainer(
    options?.symbols ?? {},
    render,
    options?.prepare,
  )
  return {
    html: withRuntimeContainer(container, () => renderToString(result)),
    payload: toResumePayload(container),
  }
}

export const serializeResumePayload = (payload: ResumePayload) =>
  getResumePayloadScriptContent(payload)
