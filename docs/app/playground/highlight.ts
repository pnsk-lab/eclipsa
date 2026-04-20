import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import javascript from 'shiki/dist/langs/javascript.mjs'
import json from 'shiki/dist/langs/json.mjs'
import typescript from 'shiki/dist/langs/typescript.mjs'
import githubLight from 'shiki/dist/themes/github-light.mjs'
import type { PlaygroundOutputLanguage } from './shared.ts'

let shikiPromise: ReturnType<typeof createHighlighterCore> | null = null

const loadShiki = () => {
  if (!shikiPromise) {
    shikiPromise = createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      langs: [javascript, json, typescript],
      themes: [githubLight],
    })
  }

  return shikiPromise
}

const HIGHLIGHT_LANGUAGE_MAP: Record<PlaygroundOutputLanguage, 'javascript' | 'json'> = {
  javascript: 'javascript',
  json: 'json',
}

export const highlightCode = async (code: string, language: PlaygroundOutputLanguage) => {
  const highlighter = await loadShiki()

  return highlighter.codeToHtml(code, {
    lang: HIGHLIGHT_LANGUAGE_MAP[language],
    theme: 'github-light',
  })
}
