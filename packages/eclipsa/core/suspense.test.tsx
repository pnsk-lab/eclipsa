import { describe, expect, it } from 'vitest'
import { component$ } from './component.ts'
import { __eclipsaComponent } from './internal.ts'
import { renderSSR, renderSSRAsync, renderSSRStream } from './ssr.ts'
import { signal, useSignal } from './signal.ts'
import { Suspense } from './suspense.ts'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Suspense', () => {
  it('resolves async computed signals during async SSR', async () => {
    const App = component$(
      __eclipsaComponent(
        () => {
          const ReadValue = component$(
            __eclipsaComponent(
              () => {
                const value = useSignal.computed(async () => {
                  await wait(0)
                  return 'ready'
                })
                return <p>{value.value}</p>
              },
              'suspense-read-value',
              () => [],
            ),
          )

          return (
            <Suspense fallback={<p>loading</p>}>
              <ReadValue />
            </Suspense>
          )
        },
        'suspense-test-app',
        () => [],
      ),
    )

    const { html } = await renderSSRAsync(() => <App />)

    expect(html).toContain('<p>ready</p>')
    expect(html).not.toContain('loading')
  })

  it('streams suspense fallbacks before resolved boundary content', async () => {
    const App = component$(
      __eclipsaComponent(
        () => {
          const ReadValue = component$(
            __eclipsaComponent(
              () => {
                const value = useSignal.computed(async () => {
                  await wait(0)
                  return 'ready'
                })
                return <p>{value.value}</p>
              },
              'suspense-stream-value',
              () => [],
            ),
          )

          return (
            <Suspense fallback={<p>loading</p>}>
              <ReadValue />
            </Suspense>
          )
        },
        'suspense-stream-app',
        () => [],
      ),
    )

    const { html, chunks } = await renderSSRStream(() => <App />)
    const streamedChunks: Array<{ boundaryId: string; html: string }> = []
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

    const App = component$(
      __eclipsaComponent(
        () => {
          const ReadValue = component$(
            __eclipsaComponent(
              () => {
                const value = useSignal.computed(async () => {
                  invocationCount += 1
                  await wait(0)
                  return `ready-${invocationCount}`
                })
                return <p>{value.value}</p>
              },
              'suspense-request-value',
              () => [],
            ),
          )

          return (
            <Suspense fallback={<p>loading</p>}>
              <ReadValue />
            </Suspense>
          )
        },
        'suspense-request-app',
        () => [],
      ),
    )

    const first = await renderSSRAsync(() => <App />)
    const second = await renderSSRAsync(() => <App />)

    expect(first.html).toContain('<p>ready-1</p>')
    expect(second.html).toContain('<p>ready-2</p>')
    expect(invocationCount).toBe(2)
  })

  it('does not leak request-scoped async signal snapshots across concurrent SSR requests', async () => {
    let fastInvocationCount = 0
    let slowInvocationCount = 0
    let releaseSlowRequest!: () => void
    const slowRequestGate = new Promise<void>((resolve) => {
      releaseSlowRequest = resolve
    })

    const App = component$(
      __eclipsaComponent(
        ({ blockSlow, label }: { blockSlow: boolean; label: string }) => {
          const ReadValue = component$(
            __eclipsaComponent(
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

                return (
                  <div>
                    <p>{fastValue.value}</p>
                    <p>{slowValue.value}</p>
                  </div>
                )
              },
              'suspense-concurrent-request-value',
              () => [],
            ),
          )

          return (
            <Suspense fallback={<p>loading</p>}>
              <ReadValue />
            </Suspense>
          )
        },
        'suspense-concurrent-request-app',
        () => [],
      ),
    )

    const first = renderSSRAsync(() => <App blockSlow label="first" />)
    await wait(10)
    const second = renderSSRAsync(() => <App blockSlow={false} label="second" />)
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
})
