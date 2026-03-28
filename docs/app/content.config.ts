import { defineCollection, glob } from '@eclipsa/content'

export const docs = defineCollection({
  loader: glob({
    base: './content/docs',
    pattern: '**/*.md',
  }),
  markdown: {
    highlight: {
      theme: 'github-dark',
    }
  },
  search: {
    hotkey: 'k',
    placeholder: 'Search docs',
  },
})
