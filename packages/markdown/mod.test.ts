import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it } from 'vitest'
import { renderSSR } from 'eclipsa'
import { MarkdownStream } from './mod.ts'
import {
  collectMarkdownSource,
  consumeMarkdownSource,
  renderMarkdownToHtml,
} from './markdown-stream.tsx'
describe('@eclipsa/markdown', () => {
  it('renders headings, inline formatting, and lists into safe HTML', () => {
    expect(
      renderMarkdownToHtml(
        '# Hello\n\nParagraph with **bold** and *em* and `code` and [safe](https://example.com).\n\n- one\n- two',
      ),
    ).toBe(
      '<h1>Hello</h1><p>Paragraph with <strong>bold</strong> and <em>em</em> and <code>code</code> and <a href="https://example.com">safe</a>.</p><ul><li>one</li><li>two</li></ul>',
    )
  })
  it('escapes raw HTML and strips unsafe link protocols', () => {
    expect(renderMarkdownToHtml('<script>alert(1)</script>\n\n[x](javascript:alert(1))')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p><p>x</p>',
    )
  })
  it('keeps balanced parentheses inside markdown link urls', () => {
    expect(renderMarkdownToHtml('[docs](https://example.com/docs(v2))')).toBe(
      '<p><a href="https://example.com/docs(v2)">docs</a></p>',
    )
  })
  it('renders unterminated fenced code blocks while the stream is incomplete', () => {
    expect(renderMarkdownToHtml('```ts\nconst answer = 42')).toBe(
      '<pre><code class="language-ts" data-language="ts">const answer = 42</code></pre>',
    )
  })
  it('collects synchronous chunk sources with utf-8 decoding', () => {
    const bytes = new TextEncoder().encode('\u3053\u3093\u306B\u3061\u306F')
    expect(collectMarkdownSource([bytes.subarray(0, 6), bytes.subarray(6)])).toBe(
      '\u3053\u3093\u306B\u3061\u306F',
    )
  })
  it('consumes asynchronous chunk sources incrementally', async () => {
    const bytes = new TextEncoder().encode('\u3053\u3093\u306B\u3061\u306F')
    const chunks = []
    await consumeMarkdownSource(
      (async function* () {
        yield bytes.subarray(0, 4)
        yield bytes.subarray(4)
        yield '\n\n## done'
      })(),
      (chunk) => {
        chunks.push(chunk)
      },
    )
    expect(chunks.join('')).toBe('\u3053\u3093\u306B\u3061\u306F\n\n## done')
  })
  it('consumes ReadableStream chunk sources incrementally', async () => {
    const bytes = new TextEncoder().encode('\u3053\u3093\u306B\u3061\u306F')
    const chunks = []
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 4))
        controller.enqueue(bytes.subarray(4))
        controller.enqueue('\n\n## done')
        controller.close()
      },
    })
    await consumeMarkdownSource(stream, (chunk) => {
      chunks.push(chunk)
    })
    expect(chunks.join('')).toBe('\u3053\u3093\u306B\u3061\u306F\n\n## done')
  })
  it('renders static markdown sources through the public component', () => {
    const { html, payload } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(
        MarkdownStream,
        { as: 'article', class: 'prose', source: '# Hello\n\nWorld' },
        void 0,
        false,
        {
          fileName: 'packages/markdown/mod.test.ts',
          lineNumber: 85,
          columnNumber: 7,
        },
      ),
    )
    expect(html).toContain('<article class="prose"><h1>Hello</h1><p>World</p></article>')
    expect(
      Object.values(payload.components).some(
        (component) => component.symbol === '@eclipsa/markdown:MarkdownStream',
      ),
    ).toBe(true)
  })
})
