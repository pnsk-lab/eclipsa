import { defineCollection, glob } from '@eclipsa/content'
import { z } from 'zod'

export const docs = defineCollection({
  loader: glob({
    base: './content/docs',
    pattern: '**/*.md',
  }),
  schema: z.object({
    description: z.string(),
    order: z.number(),
    title: z.string(),
  }),
})
