import type { ContentSearchResult } from '@eclipsa/content'
import { onCleanup, onVisible, useSignal, useWatch } from 'eclipsa'
import clsx from 'clsx'

const DEFAULT_PLACEHOLDER = 'Search docs'
const DEFAULT_HOTKEY = 'k'

const formatHotkey = (value: string) =>
  value.trim().slice(0, 1).toUpperCase() || DEFAULT_HOTKEY.toUpperCase()

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

  if (props.loading) {
    return <div class="px-3 py-10 text-center text-sm text-zinc-400">Searching…</div>
  }

  if (props.query.trim() === '') {
    return (
      <div class="px-3 py-10 text-center text-sm text-zinc-400">
        Search titles, headings, content, and code.
      </div>
    )
  }

  if (props.results.length === 0) {
    return <div class="px-3 py-10 text-center text-sm text-zinc-400">No results found.</div>
  }

  return (
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
}

export const DocsSearchDialog = () => {
  const inputRef: { value: HTMLInputElement | undefined } = { value: undefined }
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
  const disposed = useSignal(false)

  const close = () => {
    open.value = false
    query.value = ''
    results.value = []
    selectedIndex.value = 0
    loading.value = false
    if (searchTimeout.value) {
      clearTimeout(searchTimeout.value)
      searchTimeout.value = undefined
    }
  }

  const openDialog = () => {
    open.value = true
    queueMicrotask(() => {
      inputRef.value?.focus()
      inputRef.value?.select()
    })
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

  useWatch(() => {
    scheduleSearch(query.value)
  }, [query])

  onVisible(() => {
    disposed.value = false

    void import('virtual:eclipsa-content:search')
      .then((mod) => {
        if (disposed.value) {
          return
        }
        searchModule.value = mod
        hotkey.value = mod.searchOptions.hotkey
        placeholder.value = mod.searchOptions.placeholder
        if (query.value.trim() !== '') {
          scheduleSearch(query.value)
        }
      })
      .catch(() => {})

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

    const handleInputKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        selectedIndex.value = Math.min(
          selectedIndex.value + 1,
          Math.max(results.value.length - 1, 0),
        )
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

    document.addEventListener('keydown', handleKeyDown)
    inputRef.value?.addEventListener('keydown', handleInputKeyDown)

    onCleanup(() => {
      disposed.value = true
      if (searchTimeout.value) {
        clearTimeout(searchTimeout.value)
        searchTimeout.value = undefined
      }
      document.removeEventListener('keydown', handleKeyDown)
      inputRef.value?.removeEventListener('keydown', handleInputKeyDown)
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

      <div
        class={clsx(
          'fixed inset-0 z-[90] flex items-start justify-center bg-zinc-950/28 px-4 pt-24 backdrop-blur-sm transition-opacity',
          open.value ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        data-testid="docs-search-overlay"
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
              bind:value={query}
              class="w-full bg-transparent text-base text-zinc-900 outline-none placeholder:text-zinc-400"
              data-testid="docs-search-input"
              placeholder={placeholder.value}
              ref={inputRef}
              type="text"
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
            <SearchResultsBody
              loading={loading.value}
              onResultClick={handleResultClick}
              query={query.value}
              results={results.value}
              selectedIndex={selectedIndex.value}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
