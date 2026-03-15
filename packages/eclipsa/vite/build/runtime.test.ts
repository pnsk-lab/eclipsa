import { describe, expect, it } from 'vitest'
import * as runtime from './runtime.ts'

describe('vite build runtime exports', () => {
  it('exposes the helpers used by the generated server bundle', () => {
    expect(runtime).toMatchObject({
      ACTION_CONTENT_TYPE: expect.any(String),
      Fragment: expect.anything(),
      composeRouteMetadata: expect.any(Function),
      deserializeValue: expect.any(Function),
      escapeJSONScriptText: expect.any(Function),
      executeAction: expect.any(Function),
      executeLoader: expect.any(Function),
      getActionFormSubmissionId: expect.any(Function),
      getNormalizedActionInput: expect.any(Function),
      hasAction: expect.any(Function),
      hasLoader: expect.any(Function),
      jsxDEV: expect.any(Function),
      primeActionState: expect.any(Function),
      renderRouteMetadataHead: expect.any(Function),
      renderSSRAsync: expect.any(Function),
      resolvePendingLoaders: expect.any(Function),
      serializeResumePayload: expect.any(Function),
    })
  })
})
