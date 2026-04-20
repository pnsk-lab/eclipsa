import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it } from 'vitest'
import { __eclipsaComponent } from './internal.ts'
import { renderSSRAsync, renderSSRStream } from './ssr.ts'
import { signal, useSignal } from './signal.ts'
import { Suspense, isSuspenseType } from './suspense.ts'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
describe('Suspense', () => {
  it('resolves async computed signals during async SSR', async () => {
    const App = __eclipsaComponent(
      () => {
        const ReadValue = __eclipsaComponent(
          () => {
            const value = useSignal.computed(async () => {
              await wait(0)
              return 'ready'
            })
            return /* @__PURE__ */ jsxDEV('p', { children: value.value }, void 0, false, {
              fileName: 'packages/eclipsa/core/suspense.test.ts',
              lineNumber: 19,
              columnNumber: 20,
            })
          },
          'suspense-read-value',
          () => [],
        )
        return /* @__PURE__ */ jsxDEV(
          Suspense,
          {
            fallback: /* @__PURE__ */ jsxDEV('p', { children: 'loading' }, void 0, false, {
              fileName: 'packages/eclipsa/core/suspense.test.ts',
              lineNumber: 26,
              columnNumber: 31,
            }),
            children: /* @__PURE__ */ jsxDEV(ReadValue, {}, void 0, false, {
              fileName: 'packages/eclipsa/core/suspense.test.ts',
              lineNumber: 27,
              columnNumber: 13,
            }),
          },
          void 0,
          false,
          {
            fileName: 'packages/eclipsa/core/suspense.test.ts',
            lineNumber: 26,
            columnNumber: 11,
          },
        )
      },
      'suspense-test-app',
      () => [],
    )
    const { html } = await renderSSRAsync(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/suspense.test.ts',
        lineNumber: 35,
        columnNumber: 49,
      }),
    )
    expect(html).toContain('<p>ready</p>')
    expect(html).not.toContain('loading')
  })
  it('streams suspense fallbacks before resolved boundary content', async () => {
    const App = __eclipsaComponent(
      () => {
        const ReadValue = __eclipsaComponent(
          () => {
            const value = useSignal.computed(async () => {
              await wait(0)
              return 'ready'
            })
            return /* @__PURE__ */ jsxDEV('p', { children: value.value }, void 0, false, {
              fileName: 'packages/eclipsa/core/suspense.test.ts',
              lineNumber: 50,
              columnNumber: 20,
            })
          },
          'suspense-stream-value',
          () => [],
        )
        return /* @__PURE__ */ jsxDEV(
          Suspense,
          {
            fallback: /* @__PURE__ */ jsxDEV('p', { children: 'loading' }, void 0, false, {
              fileName: 'packages/eclipsa/core/suspense.test.ts',
              lineNumber: 57,
              columnNumber: 31,
            }),
            children: /* @__PURE__ */ jsxDEV(ReadValue, {}, void 0, false, {
              fileName: 'packages/eclipsa/core/suspense.test.ts',
              lineNumber: 58,
              columnNumber: 13,
            }),
          },
          void 0,
          false,
          {
            fileName: 'packages/eclipsa/core/suspense.test.ts',
            lineNumber: 57,
            columnNumber: 11,
          },
        )
      },
      'suspense-stream-app',
      () => [],
    )
    const { html, chunks } = await renderSSRStream(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/suspense.test.ts',
        lineNumber: 66,
        columnNumber: 58,
      }),
    )
    const streamedChunks = []
    for await (const chunk of chunks) {
      streamedChunks.push({
        boundaryId: chunk.boundaryId,
        html: chunk.html,
      })
    }
    expect(html).toContain('loading')
    expect(html).not.toContain('<p>ready</p>')
    expect(streamedChunks).toHaveLength(1)
    expect(streamedChunks[0]?.boundaryId).toBe('c0.0')
    expect(streamedChunks[0]?.html).toContain('<p>ready</p>')
  })
  it('does not reuse resolved async signal snapshots across SSR requests', async () => {
    let invocationCount = 0
    const App = __eclipsaComponent(
      () => {
        const ReadValue = __eclipsaComponent(
          () => {
            const value = useSignal.computed(async () => {
              invocationCount += 1
              await wait(0)
              return `ready-${invocationCount}`
            })
            return /* @__PURE__ */ jsxDEV('p', { children: value.value }, void 0, false, {
              fileName: 'packages/eclipsa/core/suspense.test.ts',
              lineNumber: 94,
              columnNumber: 20,
            })
          },
          'suspense-request-value',
          () => [],
        )
        return /* @__PURE__ */ jsxDEV(
          Suspense,
          {
            fallback: /* @__PURE__ */ jsxDEV('p', { children: 'loading' }, void 0, false, {
              fileName: 'packages/eclipsa/core/suspense.test.ts',
              lineNumber: 101,
              columnNumber: 31,
            }),
            children: /* @__PURE__ */ jsxDEV(ReadValue, {}, void 0, false, {
              fileName: 'packages/eclipsa/core/suspense.test.ts',
              lineNumber: 102,
              columnNumber: 13,
            }),
          },
          void 0,
          false,
          {
            fileName: 'packages/eclipsa/core/suspense.test.ts',
            lineNumber: 101,
            columnNumber: 11,
          },
        )
      },
      'suspense-request-app',
      () => [],
    )
    const first = await renderSSRAsync(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/suspense.test.ts',
        lineNumber: 110,
        columnNumber: 46,
      }),
    )
    const second = await renderSSRAsync(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/suspense.test.ts',
        lineNumber: 111,
        columnNumber: 47,
      }),
    )
    expect(first.html).toContain('<p>ready-1</p>')
    expect(second.html).toContain('<p>ready-2</p>')
    expect(invocationCount).toBe(2)
  })
  it('does not leak request-scoped async signal snapshots across concurrent SSR requests', async () => {
    let fastInvocationCount = 0
    let slowInvocationCount = 0
    let releaseSlowRequest
    const slowRequestGate = new Promise((resolve) => {
      releaseSlowRequest = resolve
    })
    const App = __eclipsaComponent(
      ({ blockSlow, label }) => {
        const ReadValue = __eclipsaComponent(
          () => {
            const fastValue = useSignal.computed(async () => {
              fastInvocationCount += 1
              await wait(0)
              return `${label}-fast-${fastInvocationCount}`
            })
            const slowValue = useSignal.computed(async () => {
              slowInvocationCount += 1
              if (blockSlow) {
                await slowRequestGate
              } else {
                await wait(0)
              }
              return `${label}-slow-${slowInvocationCount}`
            })
            return /* @__PURE__ */ jsxDEV(
              'div',
              {
                children: [
                  /* @__PURE__ */ jsxDEV('p', { children: fastValue.value }, void 0, false, {
                    fileName: 'packages/eclipsa/core/suspense.test.ts',
                    lineNumber: 147,
                    columnNumber: 17,
                  }),
                  /* @__PURE__ */ jsxDEV('p', { children: slowValue.value }, void 0, false, {
                    fileName: 'packages/eclipsa/core/suspense.test.ts',
                    lineNumber: 148,
                    columnNumber: 17,
                  }),
                ],
              },
              void 0,
              true,
              {
                fileName: 'packages/eclipsa/core/suspense.test.ts',
                lineNumber: 146,
                columnNumber: 15,
              },
            )
          },
          'suspense-concurrent-request-value',
          () => [],
        )
        return /* @__PURE__ */ jsxDEV(
          Suspense,
          {
            fallback: /* @__PURE__ */ jsxDEV('p', { children: 'loading' }, void 0, false, {
              fileName: 'packages/eclipsa/core/suspense.test.ts',
              lineNumber: 157,
              columnNumber: 31,
            }),
            children: /* @__PURE__ */ jsxDEV(ReadValue, {}, void 0, false, {
              fileName: 'packages/eclipsa/core/suspense.test.ts',
              lineNumber: 158,
              columnNumber: 13,
            }),
          },
          void 0,
          false,
          {
            fileName: 'packages/eclipsa/core/suspense.test.ts',
            lineNumber: 157,
            columnNumber: 11,
          },
        )
      },
      'suspense-concurrent-request-app',
      () => [],
    )
    const first = renderSSRAsync(() =>
      /* @__PURE__ */ jsxDEV(App, { blockSlow: true, label: 'first' }, void 0, false, {
        fileName: 'packages/eclipsa/core/suspense.test.ts',
        lineNumber: 166,
        columnNumber: 40,
      }),
    )
    await wait(10)
    const second = renderSSRAsync(() =>
      /* @__PURE__ */ jsxDEV(App, { blockSlow: false, label: 'second' }, void 0, false, {
        fileName: 'packages/eclipsa/core/suspense.test.ts',
        lineNumber: 168,
        columnNumber: 41,
      }),
    )
    await wait(10)
    releaseSlowRequest()
    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult.html).toMatch(/<p>first-fast-\d+<\/p>/)
    expect(firstResult.html).toMatch(/<p>first-slow-\d+<\/p>/)
    expect(firstResult.html).not.toContain('second-fast-')
    expect(firstResult.html).not.toContain('second-slow-')
    expect(secondResult.html).toMatch(/<p>second-fast-\d+<\/p>/)
    expect(secondResult.html).toMatch(/<p>second-slow-\d+<\/p>/)
    expect(secondResult.html).not.toContain('first-fast-')
    expect(secondResult.html).not.toContain('first-slow-')
  })
  it('supports standalone computed signals', async () => {
    const source = signal(1)
    const doubled = signal.computed(() => source.value * 2)
    const asyncDoubled = signal.computed(async () => doubled.value * 2)
    expect(doubled.value).toBe(2)
    await wait(0)
    expect(asyncDoubled.value).toBe(4)
    source.value = 3
    expect(doubled.value).toBe(6)
  })
  it('recognizes suspense boundaries across duplicated module instances', () => {
    const duplicateSuspense = (props) => props.children ?? null
    duplicateSuspense[Symbol.for('eclipsa.suspense-type')] = true
    expect(isSuspenseType(Suspense)).toBe(true)
    expect(isSuspenseType(duplicateSuspense)).toBe(true)
  })
})
