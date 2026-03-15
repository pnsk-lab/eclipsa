import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { Image } from './mod.ts'
import { readLocalImage, resolveImageWidths } from './vite.ts'

describe('@eclipsa/image helpers', () => {
  it('keeps configured widths ordered and appends the source width', () => {
    expect(resolveImageWidths(1200, [960, 320, 320, 1600, -5])).toEqual([320, 960, 1200])
  })

  it('reads local image metadata', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-image-'))
    const filePath = path.join(root, 'sample.png')

    await sharp({
      create: {
        background: { alpha: 1, b: 200, g: 120, r: 40 },
        channels: 4,
        height: 600,
        width: 900,
      },
    })
      .png()
      .toFile(filePath)

    await expect(readLocalImage(filePath)).resolves.toMatchObject({
      format: 'png',
      height: 600,
      width: 900,
    })
  })

  it('renders img defaults from imported metadata', () => {
    const element = Image({
      alt: 'Preview',
      src: {
        format: 'webp',
        height: 400,
        src: '/assets/example-960w.webp',
        variants: [
          {
            format: 'webp',
            height: 133,
            src: '/assets/example-320w.webp',
            width: 320,
          },
          {
            format: 'webp',
            height: 400,
            src: '/assets/example-960w.webp',
            width: 960,
          },
        ],
        width: 960,
      },
    })

    expect(element).toMatchObject({
      props: {
        alt: 'Preview',
        decoding: 'async',
        height: 400,
        loading: 'lazy',
        sizes: '100vw',
        src: '/assets/example-960w.webp',
        srcset: '/assets/example-320w.webp 320w, /assets/example-960w.webp 960w',
        width: 960,
      },
      type: 'img',
    })
  })
})
