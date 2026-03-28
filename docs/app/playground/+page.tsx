import { onCleanup, onMount, useSignal, type MetadataContext } from 'eclipsa'
import type { IDisposable, editor } from 'monaco-editor'
import {
  buildPlaygroundOutputInBrowser,
  getPlaygroundIsolationError,
  loadPlaygroundMonaco,
} from './browser-compiler.ts'
import { highlightCode } from './highlight.ts'
import {
  DEFAULT_PLAYGROUND_SOURCE,
  PLAYGROUND_EDITOR_LANGUAGE,
  type PlaygroundBuildResult,
} from './shared.ts'

export const metadata = ({ url }: MetadataContext) => ({
  canonical: url.pathname,
  title: 'Playground',
})

const createPendingResult = (): PlaygroundBuildResult => ({
  error: 'Compiling...',
  ok: false,
})

export default () => {
  const editorRef = useSignal<HTMLDivElement | undefined>()
  const source = useSignal(DEFAULT_PLAYGROUND_SOURCE)
  const buildResult = useSignal<PlaygroundBuildResult>(createPendingResult())
  const highlightedFiles = useSignal<Record<string, string>>({})
  const bootMessage = useSignal<string | null>(null)
  const editorReady = useSignal(false)
  const isCompiling = useSignal(true)
  const selectedFilePath = useSignal<string | null>(null)
  const handleFileSelect = (event: Event) => {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) {
      return
    }

    selectedFilePath.value = target.dataset.filePath ?? null
  }

  onMount(() => {
    const isolationError = getPlaygroundIsolationError()
    if (isolationError) {
      bootMessage.value = isolationError
      buildResult.value = {
        error: isolationError,
        ok: false,
      }
      isCompiling.value = false
      return
    }

    const state: {
      changeSubscription: IDisposable | null
      compileTimer: number | null
      currentRequest: number
      disposed: boolean
      editorInstance: editor.IStandaloneCodeEditor | null
      editorModel: editor.ITextModel | null
      resizeObserver: ResizeObserver | null
    } = {
      changeSubscription: null,
      compileTimer: null,
      currentRequest: 0,
      disposed: false,
      editorInstance: null,
      editorModel: null,
      resizeObserver: null,
    }

    const runCompile = async (nextSource: string, delay = 0) => {
      const requestId = ++state.currentRequest

      if (state.compileTimer !== null) {
        window.clearTimeout(state.compileTimer)
      }

      if (delay > 0) {
        state.compileTimer = window.setTimeout(() => {
          void runCompile(nextSource)
        }, delay)
        return
      }

      isCompiling.value = true
      highlightedFiles.value = {}
      const result = await buildPlaygroundOutputInBrowser(nextSource)

      if (state.disposed || requestId !== state.currentRequest) {
        return
      }

      buildResult.value = result
      isCompiling.value = false

      if (!result.ok) {
        selectedFilePath.value = null
        return
      }

      selectedFilePath.value =
        result.files.find((file) => file.path === selectedFilePath.value)?.path ??
        result.files[0]?.path ??
        null

      try {
        const highlightedEntries = await Promise.all(
          result.files.map(async (file) => [file.path, await highlightCode(file.code, file.language)] as const),
        )

        if (state.disposed || requestId !== state.currentRequest) {
          return
        }

        highlightedFiles.value = Object.fromEntries(highlightedEntries)
      } catch {}
    }

    void (async () => {
      try {
        const monaco = await loadPlaygroundMonaco()
        const mountPoint = editorRef.value

        if (!mountPoint || state.disposed) {
          return
        }

        state.editorModel = monaco.editor.createModel(
          source.value,
          PLAYGROUND_EDITOR_LANGUAGE,
          monaco.Uri.parse('file:///playground-input.tsx'),
        )

        if (state.editorModel.getLanguageId() !== PLAYGROUND_EDITOR_LANGUAGE) {
          monaco.editor.setModelLanguage(state.editorModel, PLAYGROUND_EDITOR_LANGUAGE)
        }

        state.editorInstance = monaco.editor.create(mountPoint, {
          automaticLayout: false,
          fontLigatures: true,
          fontSize: 14,
          minimap: {
            enabled: false,
          },
          model: state.editorModel,
          padding: {
            bottom: 24,
            top: 24,
          },
          roundedSelection: false,
          'semanticHighlighting.enabled': true,
          scrollBeyondLastLine: false,
          tabSize: 2,
        })

        state.resizeObserver = new ResizeObserver(() => {
          state.editorInstance?.layout()
        })
        state.resizeObserver.observe(mountPoint)

        state.changeSubscription = state.editorInstance!.onDidChangeModelContent(() => {
          const nextSource = state.editorModel?.getValue() ?? ''
          source.value = nextSource
          void runCompile(nextSource, 180)
        })

        editorReady.value = true
        await runCompile(source.value)
      } catch (error) {
        bootMessage.value = error instanceof Error ? error.message : String(error)
        buildResult.value = {
          error: bootMessage.value,
          ok: false,
        }
        isCompiling.value = false
      }
    })()

    onCleanup(() => {
      state.disposed = true
      if (state.compileTimer !== null) {
        window.clearTimeout(state.compileTimer)
      }
      state.changeSubscription?.dispose()
      state.resizeObserver?.disconnect()
      state.editorInstance?.dispose()
      state.editorModel?.dispose()
    })
  })

  const renderBuildError = () => (
    <div class="flex h-full min-h-0 flex-col">
      <div class="border-b border-zinc-950/10 px-6 py-3 font-mono text-[12px] uppercase tracking-[0.22em] text-rose-700">
        Compile error
      </div>
      <pre class="min-h-0 flex-1 overflow-auto px-6 py-6 font-mono text-[13px] leading-6 text-rose-700 whitespace-pre-wrap">
        {isCompiling.value ? 'Compiling current source...' : !buildResult.value.ok ? buildResult.value.error : ''}
      </pre>
    </div>
  )

  return (
    <div class="box-border h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.2),transparent_24%),radial-gradient(circle_at_top_right,rgba(253,224,71,0.18),transparent_20%),#f4efe6] px-3 pb-6 pt-22 text-zinc-950 md:px-6">
      <div class="mx-auto flex h-full min-h-0 w-full max-w-[1800px] flex-col overflow-hidden rounded-[30px] border border-zinc-950/10 bg-white/65 backdrop-blur-xl">
        {bootMessage.value ? (
          <div class="border-b border-amber-300/60 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 md:px-5">
            {bootMessage.value}
          </div>
        ) : null}

        <div class="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
          <section class="flex min-h-0 flex-col overflow-hidden border-b border-zinc-950/10 bg-[#0b1020] xl:border-b-0 xl:border-r xl:border-r-white/10">
            <div class="relative min-h-0 flex-1 overflow-hidden">
              <div class="h-full w-full" ref={editorRef}></div>
              {!editorReady.value ? (
                <pre class="pointer-events-none absolute inset-0 overflow-auto px-6 py-6 font-mono text-[13px] leading-6 text-white/65 whitespace-pre-wrap">
                  {source.value}
                </pre>
              ) : null}
            </div>
          </section>

          <section class="flex min-h-0 flex-col overflow-hidden bg-[#fffdf8]">
            <div class="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-zinc-950/10 bg-white/80 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.26em] text-zinc-500 md:px-5">
              <span class="border-b-2 border-transparent pb-2 text-zinc-400">Output</span>
              <span class="border-b-2 border-cyan-600 pb-2 text-zinc-950">Result</span>
              <span class="border-b-2 border-transparent pb-2">Client output</span>
            </div>

            <div class="grid min-h-0 flex-1 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div class="min-h-0 overflow-auto border-b border-zinc-950/10 bg-[#f4f0e8] px-4 py-4 lg:border-b-0 lg:border-r">
                {buildResult.value.ok ? (
                  <div class="flex flex-col gap-1.5">
                    {buildResult.value.files.map((file) => (
                      <button
                        class={
                          selectedFilePath.value === file.path
                            ? 'rounded-lg bg-white px-3 py-2 text-left font-mono text-[13px] text-zinc-950 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]'
                            : 'rounded-lg px-3 py-2 text-left font-mono text-[13px] text-zinc-600 transition-colors hover:bg-white/70 hover:text-zinc-950'
                        }
                        data-file-path={file.path}
                        type="button"
                        onClick={handleFileSelect}
                      >
                        <div>{file.relativePath}</div>
                        {file.symbolKind ? (
                          <div class="mt-1 text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                            {file.symbolKind}
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div
                    class={
                      isCompiling.value
                        ? 'mt-4 font-mono text-sm text-zinc-500'
                        : 'mt-4 font-mono text-sm text-rose-700'
                    }
                  >
                    {isCompiling.value ? 'Building chunks…' : 'Compile error'}
                  </div>
                )}
              </div>

              <div class="min-h-0 overflow-hidden bg-[linear-gradient(to_bottom,rgba(15,23,42,0.03),transparent_180px)]">
                {buildResult.value.ok ? (() => {
                  const selectedFile =
                    buildResult.value.files.find((file) => file.path === selectedFilePath.value) ??
                    buildResult.value.files[0]

                  if (!selectedFile) {
                    return (
                      <pre class="h-full overflow-auto px-6 py-6 font-mono text-[13px] leading-6 text-zinc-800 whitespace-pre-wrap">
                        No generated files.
                      </pre>
                    )
                  }

                  const highlightedHtml = highlightedFiles.value[selectedFile.path]

                  return (
                    <div class="flex h-full min-h-0 flex-col">
                      <div class="border-b border-zinc-950/10 px-6 py-3 font-mono text-[12px] text-zinc-500">
                        {selectedFile.path}
                      </div>

                      {highlightedHtml ? (
                        <div
                          class="min-h-0 flex-1 overflow-hidden px-6 py-6 [&_.line]:inline-block [&_.line]:min-w-full [&_code]:font-mono [&_code]:whitespace-pre [&_pre]:m-0 [&_pre]:h-full [&_pre]:overflow-auto [&_pre]:!bg-transparent [&_pre]:p-0 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-6"
                          dangerouslySetInnerHTML={highlightedHtml}
                        />
                      ) : (
                        <pre class="min-h-0 flex-1 overflow-auto px-6 py-6 font-mono text-[13px] leading-6 text-zinc-800 whitespace-pre">
                          {selectedFile.code}
                        </pre>
                      )}
                    </div>
                  )
                })() : (
                  renderBuildError()
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
