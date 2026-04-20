export const PLAYGROUND_ENTRY_ID = 'playground-input.tsx'
export const PLAYGROUND_EDITOR_LANGUAGE = 'typescript'
export const PLAYGROUND_SYMBOL_QUERY = 'eclipsa-symbol'
export const PLAYGROUND_DIST_ROOT = '/dist'

export const DEFAULT_PLAYGROUND_SOURCE = `import { useSignal } from 'eclipsa'

export default function CounterCard() {
  const count = useSignal(0)

  return (
    <section class="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <p class="text-sm uppercase tracking-[0.3em] text-zinc-500">Counter</p>
      <div class="mt-4 flex items-center gap-4">
        <button
          class="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
          onClick={() => count.value++}
        >
          Increment
        </button>
        <strong class="text-2xl text-zinc-950">{count.value}</strong>
      </div>
    </section>
  )
}
`

export type PlaygroundOutputLanguage = 'javascript' | 'json'

export interface PlaygroundOutputFile {
  code: string
  fileName: string
  language: PlaygroundOutputLanguage
  path: string
  relativePath: string
  symbolKind?: 'action' | 'component' | 'event' | 'lazy' | 'loader' | 'watch'
}

export interface PlaygroundBuildSuccess {
  ok: true
  files: PlaygroundOutputFile[]
}

export interface PlaygroundBuildFailure {
  error: string
  ok: false
}

export type PlaygroundBuildResult = PlaygroundBuildFailure | PlaygroundBuildSuccess

export const formatPlaygroundError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message.trim() || error.stack?.trim() || 'Unknown compiler error.'
  }

  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  try {
    return JSON.stringify(error, null, 2)
  } catch {
    return 'Unknown compiler error.'
  }
}
