export default function resumeLoaderFixture(scope: unknown[], event?: Event) {
  ;(globalThis as { __eclipsaResumeLoaderCalls?: unknown[] }).__eclipsaResumeLoaderCalls?.push([
    scope,
    (event?.currentTarget as Element | null)?.getAttribute('id'),
  ])
}
