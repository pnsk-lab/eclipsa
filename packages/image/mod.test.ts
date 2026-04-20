import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { Image } from './mod.ts'
import {
  createBuildAssetUrl,
  createAssetName,
  eclipsaImage,
  isAllowedImagePath,
  readLocalImage,
  resolveImageWidths,
  toContentType,
} from './vite.ts'
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
  it('returns the correct jpeg mime type', () => {
    expect(toContentType('jpeg')).toBe('image/jpeg')
    expect(toContentType('png')).toBe('image/png')
  })
  it('creates distinct emitted asset names for duplicate basenames', () => {
    expect(createAssetName('/tmp/one/hero.png', 320, 'png')).not.toBe(
      createAssetName('/tmp/two/hero.png', 320, 'png'),
    )
  })
  it('creates public build asset URLs for emitted files', () => {
    expect(createBuildAssetUrl('assets/example-320w.webp')).toBe('/assets/example-320w.webp')
    expect(createBuildAssetUrl('/assets/example-320w.webp')).toBe('/assets/example-320w.webp')
  })
  it('inlines public build asset URLs in generated build modules', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-image-build-'))
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

    const plugin = eclipsaImage()
    plugin.configResolved?.({
      command: 'build',
      root,
      server: { fs: { allow: [] } },
    } as never)

    const emitFile = vi.fn().mockReturnValue('image-ref')
    const moduleSource = await plugin.load?.call(
      { emitFile } as never,
      `\0eclipsa-image:${filePath}?eclipsa-image`,
      undefined,
    )
    const sourceAssetFileName = `assets/${createAssetName(filePath, 900, 'png')}`

    expect(emitFile).toHaveBeenCalled()
    expect(moduleSource).toContain(JSON.stringify(createBuildAssetUrl(sourceAssetFileName)))
    expect(moduleSource).not.toContain('ROLLUP_FILE_URL')
  })
  it('only serves dev image paths inside the configured allowlist', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-image-root-'))
    const allowed = path.join(root, 'allowed')
    const denied = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-image-denied-'))
    const allowedFile = path.join(allowed, 'hero.png')
    const deniedFile = path.join(denied, 'hero.png')
    await fs.mkdir(allowed, { recursive: true })
    await fs.writeFile(allowedFile, 'ok')
    await fs.writeFile(deniedFile, 'nope')
    const config = {
      root,
      server: {
        fs: {
          allow: [allowed],
        },
      },
    }
    await expect(isAllowedImagePath(allowedFile, config)).resolves.toBe(true)
    await expect(isAllowedImagePath(deniedFile, config)).resolves.toBe(false)
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
