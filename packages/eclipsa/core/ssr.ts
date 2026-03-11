import type { JSX } from "../jsx/types.ts";
import { renderToString } from "../jsx/mod.ts";
import {
  beginSSRContainer,
  getResumePayloadScriptContent,
  toResumePayload,
  type ResumePayload,
  withRuntimeContainer,
} from "./runtime.ts";

export interface SSRRenderResult {
  html: string;
  payload: ResumePayload;
}

export const renderSSR = (
  render: () => JSX.Element | JSX.Element[],
  options?: {
    symbols?: Record<string, string>;
  },
): SSRRenderResult => {
  const { container, result } = beginSSRContainer(options?.symbols ?? {}, render);
  return {
    html: withRuntimeContainer(container, () => renderToString(result)),
    payload: toResumePayload(container),
  };
};

export const serializeResumePayload = (payload: ResumePayload) => getResumePayloadScriptContent(payload);
