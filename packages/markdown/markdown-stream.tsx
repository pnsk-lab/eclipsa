import type { JSX } from 'eclipsa'
import { noSerialize, onCleanup, useSignal, useWatch } from 'eclipsa'
import { __eclipsaComponent } from 'eclipsa/internal'

type MarkdownBinaryChunk = ArrayBuffer | ArrayBufferView

export type MarkdownChunk = string | MarkdownBinaryChunk

export type MarkdownStreamSource =
  | AsyncIterable<MarkdownChunk>
  | Iterable<MarkdownChunk>
  | MarkdownChunk
  | ReadableStream<MarkdownChunk>
  | null
  | undefined

type MarkdownStreamTag = keyof HTMLElementTagNameMap

export type MarkdownStreamProps<TTag extends MarkdownStreamTag = 'div'> = Omit<
  JSX.IntrinsicElements[TTag],
  'children' | 'dangerouslySetInnerHTML'
> & {
  as?: TTag
  onError?: (error: unknown) => void
  source?: MarkdownStreamSource
}

const INTERNAL_MARKDOWN_STREAM_PROPS = new Set([
  'as',
  'children',
  'dangerouslySetInnerHTML',
  'onError',
  'source',
])

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const escapeAttr = escapeHtml

const MARKDOWN_LINK_REGEX = /\[([^\]\n]+)\]\(((?:[^()\n]+|\([^()\n]*\))+)\)/g

const isBinaryChunk = (value: unknown): value is MarkdownBinaryChunk =>
  value instanceof ArrayBuffer || ArrayBuffer.isView(value)

const isMarkdownChunk = (value: unknown): value is MarkdownChunk =>
  typeof value === 'string' || isBinaryChunk(value)

function isAsyncIterableValue<T>(value: unknown): value is AsyncIterable<T> {
  return (
    !!value &&
    typeof value === 'object' &&
    Symbol.asyncIterator in value &&
    typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === 'function'
  )
}

function isReadableStreamValue(value: unknown): value is ReadableStream<MarkdownChunk> {
  return typeof ReadableStream !== 'undefined' && value instanceof ReadableStream
}

function isSyncIterableValue<T>(value: unknown): value is Iterable<T> {
  return (
    !!value &&
    typeof value === 'object' &&
    Symbol.iterator in value &&
    typeof (value as Iterable<T>)[Symbol.iterator] === 'function'
  )
}

const toBinaryChunkBytes = (chunk: MarkdownBinaryChunk) =>
  chunk instanceof ArrayBuffer
    ? new Uint8Array(chunk)
    : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)

const decodeChunk = (chunk: MarkdownChunk, decoder: TextDecoder) => {
  if (typeof chunk === 'string') {
    return chunk
  }
  return decoder.decode(toBinaryChunkBytes(chunk), { stream: true })
}

const flushChunkDecoder = (decoder: TextDecoder) => decoder.decode()

const sanitizeUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const normalizedCharacters: string[] = []
  for (const character of trimmed) {
    if (character.charCodeAt(0) <= 0x20) {
      continue
    }
    normalizedCharacters.push(character)
  }
  const normalized = normalizedCharacters.join('').toLowerCase()
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:')
  ) {
    return null
  }
  return trimmed
}

const createPlaceholderStore = () => {
  let index = 0
  const values = new Map<string, string>()

  return {
    put(value: string) {
      const token = `\u0000md:${index++}\u0000`
      values.set(token, value)
      return token
    },
    restore(input: string) {
      let output = input
      for (const [token, value] of values) {
        output = output.split(token).join(value)
      }
      return output
    },
  }
}

const renderInlineMarkdown = (input: string): string => {
  if (!input) {
    return ''
  }

  const placeholders = createPlaceholderStore()
  let value = input

  value = value.replace(/`([^`\n]+)`/g, (_, code: string) =>
    placeholders.put(`<code>${escapeHtml(code)}</code>`),
  )

  value = value.replace(MARKDOWN_LINK_REGEX, (_, label: string, href: string) => {
    const sanitized = sanitizeUrl(href)
    const renderedLabel = renderInlineMarkdown(label)
    return placeholders.put(
      sanitized ? `<a href="${escapeAttr(sanitized)}">${renderedLabel}</a>` : renderedLabel,
    )
  })

  value = value.replace(/<((?:https?:\/\/|mailto:|tel:)[^>\s]+)>/g, (_, href: string) =>
    placeholders.put(`<a href="${escapeAttr(href)}">${escapeHtml(href)}</a>`),
  )

  let html = escapeHtml(value)

  html = html.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^\n]+?)__/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  html = html.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
  html = html.replaceAll('\n', '<br />')

  return placeholders.restore(html)
}

const isBlankLine = (line: string) => line.trim().length === 0

const matchHeadingLine = (line: string) => line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$/)

const matchFenceStart = (line: string) => line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)

const isHorizontalRuleLine = (line: string) =>
  /^ {0,3}(?:([-*_])[ \t]*(?:\1[ \t]*){2,})$/.test(line)

const isBlockquoteLine = (line: string) => /^ {0,3}> ?/.test(line)

const isOrderedListLine = (line: string) => /^ {0,3}\d+\.[ \t]+/.test(line)

const isUnorderedListLine = (line: string) => /^ {0,3}[-+*][ \t]+/.test(line)

const isParagraphBoundary = (line: string) =>
  isBlankLine(line) ||
  !!matchHeadingLine(line) ||
  !!matchFenceStart(line) ||
  isHorizontalRuleLine(line) ||
  isBlockquoteLine(line) ||
  isOrderedListLine(line) ||
  isUnorderedListLine(line)

const renderCodeFence = (
  lines: string[],
  startIndex: number,
  fence: string,
  info: string,
): { html: string; nextIndex: number } => {
  const marker = fence[0] ?? '`'
  const closingPattern = new RegExp(`^ {0,3}${marker}{${fence.length},}\\s*$`)
  const body: string[] = []
  let index = startIndex + 1

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (closingPattern.test(line)) {
      index += 1
      break
    }
    body.push(line)
    index += 1
  }

  const language = info.trim().split(/\s+/, 1)[0] ?? ''
  const languageAttr = language
    ? ` class="language-${escapeAttr(language)}" data-language="${escapeAttr(language)}"`
    : ''

  return {
    html: `<pre><code${languageAttr}>${escapeHtml(body.join('\n'))}</code></pre>`,
    nextIndex: index,
  }
}

const renderList = (
  lines: string[],
  startIndex: number,
  ordered: boolean,
): { html: string; nextIndex: number } => {
  const itemPattern = ordered ? /^ {0,3}\d+\.[ \t]+(.*)$/ : /^ {0,3}[-+*][ \t]+(.*)$/
  const items: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const matched = lines[index]?.match(itemPattern)
    if (!matched) {
      break
    }

    const itemLines = [matched[1] ?? '']
    index += 1

    while (index < lines.length) {
      const line = lines[index] ?? ''
      if (line.match(itemPattern)) {
        break
      }
      if (
        !line.startsWith(' ') &&
        !line.startsWith('\t') &&
        (matchHeadingLine(line) ||
          matchFenceStart(line) ||
          isHorizontalRuleLine(line) ||
          isBlockquoteLine(line))
      ) {
        break
      }
      if (isBlankLine(line)) {
        const nextLine = lines[index + 1] ?? ''
        if (nextLine.match(itemPattern) || isParagraphBoundary(nextLine)) {
          index += 1
          break
        }
      }
      itemLines.push(line.replace(/^ {1,4}/, ''))
      index += 1
    }

    items.push(`<li>${renderInlineMarkdown(itemLines.join('\n'))}</li>`)
  }

  const tagName = ordered ? 'ol' : 'ul'
  return {
    html: `<${tagName}>${items.join('')}</${tagName}>`,
    nextIndex: index,
  }
}

export const renderMarkdownToHtml = (input: string): string => {
  const markdown = input.replace(/\r\n?/g, '\n')
  const lines = markdown.split('\n')
  const html: string[] = []

  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (isBlankLine(line)) {
      index += 1
      continue
    }

    const heading = matchHeadingLine(line)
    if (heading) {
      const level = Math.min(heading[1]?.length ?? 1, 6)
      html.push(`<h${level}>${renderInlineMarkdown(heading[2] ?? '')}</h${level}>`)
      index += 1
      continue
    }

    const fence = matchFenceStart(line)
    if (fence) {
      const rendered = renderCodeFence(lines, index, fence[1] ?? '```', fence[2] ?? '')
      html.push(rendered.html)
      index = rendered.nextIndex
      continue
    }

    if (isHorizontalRuleLine(line)) {
      html.push('<hr />')
      index += 1
      continue
    }

    if (isBlockquoteLine(line)) {
      const quotedLines: string[] = []
      while (index < lines.length) {
        const quoted = lines[index] ?? ''
        if (isBlockquoteLine(quoted)) {
          quotedLines.push(quoted.replace(/^ {0,3}> ?/, ''))
          index += 1
          continue
        }
        if (isBlankLine(quoted) && isBlockquoteLine(lines[index + 1] ?? '')) {
          quotedLines.push('')
          index += 1
          continue
        }
        break
      }
      html.push(`<blockquote>${renderMarkdownToHtml(quotedLines.join('\n'))}</blockquote>`)
      continue
    }

    if (isOrderedListLine(line)) {
      const rendered = renderList(lines, index, true)
      html.push(rendered.html)
      index = rendered.nextIndex
      continue
    }

    if (isUnorderedListLine(line)) {
      const rendered = renderList(lines, index, false)
      html.push(rendered.html)
      index = rendered.nextIndex
      continue
    }

    const paragraphLines = [line]
    index += 1
    while (index < lines.length && !isParagraphBoundary(lines[index] ?? '')) {
      paragraphLines.push(lines[index] ?? '')
      index += 1
    }
    html.push(`<p>${renderInlineMarkdown(paragraphLines.join('\n'))}</p>`)
  }

  return html.join('')
}

const decodeStaticMarkdownSource = (source: Iterable<MarkdownChunk> | MarkdownChunk): string => {
  if (typeof source === 'string') {
    return source
  }
  if (isBinaryChunk(source)) {
    const decoder = new TextDecoder()
    return decodeChunk(source, decoder) + flushChunkDecoder(decoder)
  }

  const decoder = new TextDecoder()
  let output = ''
  for (const chunk of source) {
    if (!isMarkdownChunk(chunk)) {
      continue
    }
    output += decodeChunk(chunk, decoder)
  }
  return output + flushChunkDecoder(decoder)
}

export const collectMarkdownSource = (source: MarkdownStreamSource): string => {
  if (source === null || source === undefined) {
    return ''
  }
  if (isAsyncIterableValue(source) || isReadableStreamValue(source)) {
    return ''
  }
  if (typeof source === 'string' || isBinaryChunk(source) || isSyncIterableValue(source)) {
    return decodeStaticMarkdownSource(source)
  }
  return ''
}

async function* iterateReadableStream<T>(stream: ReadableStream<T>) {
  const reader = stream.getReader()
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) {
        return
      }
      yield next.value
    }
  } finally {
    reader.releaseLock()
  }
}

export const consumeMarkdownSource = async (
  source: MarkdownStreamSource,
  onChunk: (chunk: string) => void | Promise<void>,
) => {
  if (source === null || source === undefined) {
    return
  }
  if (!isAsyncIterableValue(source) && !isReadableStreamValue(source)) {
    const staticContent = collectMarkdownSource(source)
    if (staticContent) {
      await onChunk(staticContent)
    }
    return
  }

  const decoder = new TextDecoder()
  const iterable: AsyncIterable<MarkdownChunk> = isReadableStreamValue(source)
    ? iterateReadableStream(source)
    : (source as AsyncIterable<MarkdownChunk>)
  for await (const chunk of iterable) {
    if (!isMarkdownChunk(chunk)) {
      continue
    }
    const rendered = decodeChunk(chunk, decoder)
    if (rendered) {
      await onChunk(rendered)
    }
  }

  const remaining = flushChunkDecoder(decoder)
  if (remaining) {
    await onChunk(remaining)
  }
}

const createElementProps = (rawProps: Record<string, unknown>, getHtml: () => string) => {
  const nextProps = Object.create(null) as Record<string, unknown>
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(rawProps)) as [
    string,
    PropertyDescriptor,
  ][]) {
    if (INTERNAL_MARKDOWN_STREAM_PROPS.has(name)) {
      continue
    }
    Object.defineProperty(nextProps, name, descriptor)
  }
  Object.defineProperty(nextProps, 'dangerouslySetInnerHTML', {
    configurable: true,
    enumerable: true,
    get: getHtml,
  })
  return nextProps
}

function MarkdownStreamBody<TTag extends MarkdownStreamTag = 'div'>(
  rawProps: MarkdownStreamProps<TTag>,
): JSX.Element {
  const markdown = useSignal(collectMarkdownSource(rawProps.source))
  const state = useSignal(
    noSerialize({
      version: 0,
    }),
  )

  useWatch(() => {
    const source = rawProps.source
    const currentVersion = ++state.value.version
    markdown.value = collectMarkdownSource(source)

    if (!isAsyncIterableValue(source) && !isReadableStreamValue(source)) {
      return
    }

    onCleanup(() => {
      if (state.value.version === currentVersion) {
        state.value.version += 1
      }
    })

    void consumeMarkdownSource(source, (chunk) => {
      if (state.value.version !== currentVersion) {
        return
      }
      markdown.value += chunk
    }).catch((error) => {
      if (state.value.version !== currentVersion) {
        return
      }
      if (rawProps.onError) {
        rawProps.onError(error)
        return
      }
      console.error('Failed to consume Markdown stream.', error)
    })
  }, [() => rawProps.source])

  const tagName = typeof rawProps.as === 'string' ? rawProps.as : 'div'

  return {
    isStatic: false,
    props: createElementProps(rawProps as Record<string, unknown>, () =>
      renderMarkdownToHtml(markdown.value),
    ),
    type: tagName,
  } satisfies JSX.Element
}

interface MarkdownStreamComponent {
  <TTag extends MarkdownStreamTag = 'div'>(props: MarkdownStreamProps<TTag>): JSX.Element
}

export const MarkdownStream = __eclipsaComponent(
  MarkdownStreamBody as (props: MarkdownStreamProps) => JSX.Element,
  '@eclipsa/markdown:MarkdownStream',
  () => [],
) as MarkdownStreamComponent
