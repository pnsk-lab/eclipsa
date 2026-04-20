import type { ContentSearchResult } from '@eclipsa/content'
import { onCleanup, onMount, useSignal } from 'eclipsa'
import clsx from 'clsx'

const DEFAULT_PLACEHOLDER = 'Search docs'
const DEFAULT_HOTKEY = 'k'
type DialogRefTarget = {
  __openToken?: number
  value: HTMLDialogElement | undefined
}
type InputRefTarget = {
  value: HTMLInputElement | undefined
}

const formatHotkey = (value: string) =>
  value.trim().slice(0, 1).toUpperCase() || DEFAULT_HOTKEY.toUpperCase()

const scheduleRetry = (callback: () => void) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => callback())
    return
  }
  setTimeout(callback, 0)
}

const focusInputWhenReady = (
  dialogRef: DialogRefTarget,
  inputRef: InputRefTarget,
  token: number,
) => {
  const retryFocus = () => {
    if (dialogRef.__openToken !== token) {
      return
    }

    const input = inputRef.value
    if (!input || !input.isConnected || !input.ownerDocument?.contains(input)) {
      scheduleRetry(retryFocus)
      return
    }

    input.focus({ preventScroll: true })
    input.select()

    if (input.ownerDocument.activeElement === input) {
      return
    }

    scheduleRetry(retryFocus)
  }

  retryFocus()
}

const SearchResultsBody = (props: {
  loading: boolean
  onResultClick: (event: MouseEvent) => void
  query: string
  results: ContentSearchResult[]
  selectedIndex: number
}) => {
  const onResultClick = props.onResultClick

  const handleRowClick = (event: MouseEvent) => {
    onResultClick(event)
  }

  const body = props.loading ? (
    <div class="px-3 py-10 text-center text-sm text-zinc-400">Searching…</div>
  ) : props.query.trim() === '' ? (
    <div class="px-3 py-10 text-center text-sm text-zinc-400">
      Search titles, headings, content, and code.
    </div>
  ) : props.results.length === 0 ? (
    <div class="px-3 py-10 text-center text-sm text-zinc-400">No results found.</div>
  ) : (
    <div class="flex flex-col gap-1">
      {props.results.map((result, index) => (
        <a
          class={clsx(
            'rounded-2xl px-4 py-3 transition-colors',
            index === props.selectedIndex ? 'bg-zinc-100' : 'hover:bg-zinc-50',
          )}
          data-result-index={String(index)}
          href={result.url}
          onClick={handleRowClick}
        >
          <div class="text-sm font-semibold text-zinc-900">{result.title}</div>
          <div class="mt-1 text-xs uppercase tracking-[0.22em] text-zinc-400">
            {result.collection}
          </div>
          {result.snippet !== '' ? (
            <div class="mt-2 text-sm leading-6 text-zinc-500">{result.snippet}</div>
          ) : null}
        </a>
      ))}
    </div>
  )

  return body
}

export const DocsSearchDialog = () => {
  const dialogRef = useSignal<HTMLDialogElement | undefined>() as DialogRefTarget
  const inputRef = useSignal<HTMLInputElement | undefined>()
  const open = useSignal(false)
  const query = useSignal('')
  const placeholder = useSignal(DEFAULT_PLACEHOLDER)
  const hotkey = useSignal(DEFAULT_HOTKEY)
  const results = useSignal<ContentSearchResult[]>([])
  const selectedIndex = useSignal(0)
  const loading = useSignal(false)
  const searchModule = useSignal<{
    search: (
      query: string,
      options?: {
        limit?: number
        prefix?: boolean
      },
    ) => Promise<ContentSearchResult[]>
    searchOptions: {
      hotkey: string
      placeholder: string
    }
  } | null>(null)
  const searchTimeout = useSignal<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isComposing = useSignal(false)

  const ensureSearchModule = () => {
    if (searchModule.value) {
      return
    }

    void import('virtual:eclipsa-content:search')
      .then((mod) => {
        searchModule.value = mod
        hotkey.value = mod.searchOptions.hotkey
        placeholder.value = mod.searchOptions.placeholder
        if (query.value.trim() !== '') {
          scheduleSearch(query.value)
        }
      })
      .catch(() => {})
  }

  const finalizeDialogOpen = (token: number) => {
    ensureSearchModule()
    focusInputWhenReady(dialogRef, inputRef, token)
  }

  const openDialog = () => {
    if (open.value && dialogRef.value?.open) {
      ensureSearchModule()
      const token = dialogRef.__openToken ?? 0
      focusInputWhenReady(dialogRef, inputRef, token)
      return
    }

    const token = (dialogRef.__openToken ?? 0) + 1
    dialogRef.__openToken = token
    open.value = true

    const retryOpen = () => {
      if (dialogRef.__openToken !== token) {
        return
      }
      const dialog = dialogRef.value
      if (!dialog || !dialog.isConnected || !dialog.ownerDocument?.contains(dialog)) {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(retryOpen)
        } else {
          setTimeout(retryOpen, 0)
        }
        return
      }
      if (!dialog.open) {
        dialog.showModal()
      }
      finalizeDialogOpen(token)
    }

    retryOpen()
  }

  const close = () => {
    dialogRef.__openToken = (dialogRef.__openToken ?? 0) + 1
    if (dialogRef.value?.open) {
      dialogRef.value.close()
    }
    open.value = false
    isComposing.value = false
    query.value = ''
    results.value = []
    selectedIndex.value = 0
    loading.value = false
    if (searchTimeout.value) {
      clearTimeout(searchTimeout.value)
      searchTimeout.value = undefined
    }
  }

  const navigateToSelected = () => {
    const target = results.value[selectedIndex.value]
    if (!target || typeof window === 'undefined') {
      return
    }
    close()
    window.location.href = target.url
  }

  const scheduleSearch = (nextQuery: string) => {
    if (query.value !== nextQuery) {
      query.value = nextQuery
    }
    if (searchTimeout.value) {
      clearTimeout(searchTimeout.value)
      searchTimeout.value = undefined
    }
    if (nextQuery.trim() === '') {
      results.value = []
      selectedIndex.value = 0
      loading.value = false
      return
    }
    results.value = []
    selectedIndex.value = 0
    loading.value = true
    searchTimeout.value = setTimeout(async () => {
      searchTimeout.value = undefined
      if (!searchModule.value) {
        return
      }
      results.value = await searchModule.value.search(nextQuery)
      selectedIndex.value = 0
      if (query.value === nextQuery) {
        loading.value = false
      }
    }, 120)
  }

  const handleResultClick = (event: MouseEvent) => {
    const target = event.currentTarget
    if (!(target instanceof HTMLAnchorElement)) {
      return
    }

    const nextIndex = Number.parseInt(target.dataset.resultIndex ?? '', 10)
    if (Number.isNaN(nextIndex)) {
      close()
      return
    }

    selectedIndex.value = nextIndex
    close()
  }

  const handleOverlayClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      close()
    }
  }

  const handleInputKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || isComposing.value) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedIndex.value = Math.min(selectedIndex.value + 1, Math.max(results.value.length - 1, 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      navigateToSelected()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  const handleInput = (event: Event) => {
    if (!(event.currentTarget instanceof HTMLInputElement)) {
      return
    }
    if ((event as InputEvent).isComposing || isComposing.value) {
      return
    }
    scheduleSearch(event.currentTarget.value)
  }

  const handleCompositionStart = () => {
    isComposing.value = true
  }

  const handleCompositionEnd = (event: CompositionEvent) => {
    isComposing.value = false
    if (!(event.currentTarget instanceof HTMLInputElement)) {
      return
    }
    scheduleSearch(event.currentTarget.value)
  }

  onMount(() => {
    ensureSearchModule()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open.value) {
        event.preventDefault()
        close()
        return
      }
      if (
        event.key.toLowerCase() === hotkey.value.toLowerCase() &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        const active = document.activeElement
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
          return
        }
        event.preventDefault()
        openDialog()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    onCleanup(() => {
      if (searchTimeout.value) {
        clearTimeout(searchTimeout.value)
        searchTimeout.value = undefined
      }
      document.removeEventListener('keydown', handleKeyDown)
    })
  })

  return (
    <div class="contents">
      <button
        aria-controls="docs-search-dialog"
        aria-expanded={open.value}
        class="inline-flex h-10 w-10 items-center justify-center gap-3 rounded-full border border-[color:var(--docs-border)] bg-[color:var(--docs-panel)] px-0 text-sm font-medium text-[color:var(--docs-text-muted)] shadow-[var(--docs-shadow)] transition-colors hover:bg-[color:var(--docs-panel-hover)] hover:text-[color:var(--docs-text)] sm:w-auto sm:px-4"
        data-testid="docs-search-trigger"
        type="button"
        onClick={openDialog}
      >
        <div class="i-tabler-search text-base" />
        <span class="hidden sm:inline">Search docs</span>
        <kbd class="hidden rounded-md border border-[color:var(--docs-border)] bg-[color:var(--docs-bg-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase text-[color:var(--docs-text-soft)] sm:inline-block">
          {formatHotkey(hotkey.value)}
        </kbd>
      </button>

      <dialog
        class="fixed inset-0 z-[90] m-0 h-full max-h-none w-full max-w-none overflow-visible border-none bg-transparent p-0 text-inherit"
        data-testid="docs-search-overlay"
        ref={dialogRef}
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
      >
        <div
          class="flex min-h-full w-full items-start justify-center px-4 pt-24"
          onClick={handleOverlayClick}
        >
          <div
            class="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.18)]"
            id="docs-search-dialog"
          >
            <div class="flex items-center gap-3 border-b border-zinc-100 px-5 py-4">
              <div class="i-tabler-search text-lg text-zinc-400" />
              <input
                autoComplete="off"
                autoFocus
                class="w-full bg-transparent text-base text-zinc-900 outline-none placeholder:text-zinc-400"
                data-testid="docs-search-input"
                placeholder={placeholder.value}
                ref={inputRef}
                type="text"
                value={query.value}
                onCompositionEnd={handleCompositionEnd}
                onCompositionStart={handleCompositionStart}
                onInput={handleInput}
                onKeyDown={handleInputKeyDown}
              />
              <button
                aria-label="Close search"
                class="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                type="button"
                onClick={close}
              >
                <div class="i-tabler-x text-lg" />
              </button>
            </div>

            <div class="max-h-[60vh] overflow-y-auto px-3 py-3">
              {SearchResultsBody({
                loading: loading.value,
                onResultClick: handleResultClick,
                query: query.value,
                results: results.value,
                selectedIndex: selectedIndex.value,
              })}
            </div>
          </div>
        </div>
      </dialog>
    </div>
  )
}
