interface PlaygroundCompileStart {
  requestId: number
  source: string
}

interface PlaygroundCompileResult<TResult> extends PlaygroundCompileStart {
  result: TResult
}

export function createPlaygroundCompileQueue<TResult>(options: {
  build(source: string): Promise<TResult>
  onIdle?(): void
  onResult?(result: PlaygroundCompileResult<TResult>): void
  onStart?(result: PlaygroundCompileStart): void
}) {
  let activeSource: string | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let latestSource: string | null = null
  let nextRequestId = 0
  let readySource: string | null = null

  const clearDebounceTimer = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  const drainReadySource = () => {
    if (disposed || activeSource !== null || readySource === null) {
      return
    }

    const source = readySource
    readySource = null
    void startCompile(source)
  }

  const finishCompile = (source: string, requestId: number) => {
    if (disposed || activeSource !== source || nextRequestId !== requestId) {
      return
    }

    activeSource = null

    if (readySource !== null) {
      drainReadySource()
      return
    }

    options.onIdle?.()
  }

  const startCompile = async (source: string) => {
    if (disposed) {
      return
    }

    activeSource = source
    const requestId = ++nextRequestId
    options.onStart?.({ requestId, source })

    try {
      const result = await options.build(source)

      if (disposed || activeSource !== source || nextRequestId !== requestId) {
        return
      }

      options.onResult?.({
        requestId,
        result,
        source,
      })
    } finally {
      finishCompile(source, requestId)
    }
  }

  const queueLatestSource = (source: string, delay = 0) => {
    if (disposed) {
      return
    }

    latestSource = source
    readySource = null
    clearDebounceTimer()

    if (delay > 0) {
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        readySource = latestSource
        drainReadySource()
      }, delay)
      return
    }

    readySource = source
    drainReadySource()
  }

  return {
    dispose() {
      disposed = true
      clearDebounceTimer()
      readySource = null
    },
    queue(source: string, delay = 0) {
      queueLatestSource(source, delay)
    },
  }
}
