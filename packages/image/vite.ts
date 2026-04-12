import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import sharp from 'sharp'
import type { Plugin, ResolvedConfig } from 'vite'
import type { EclipsaImageOptions, ImageOutputFormat } from './mod.ts'

const IMAGE_QUERY_FLAG = 'eclipsa-image'
const VIRTUAL_IMAGE_PREFIX = '\0eclipsa-image:'
const DEV_IMAGE_ENDPOINT = '/__eclipsa/image'
const DEFAULT_WIDTHS = [320, 640, 960, 1280, 1600] as const
const DEFAULT_QUALITY = 80
const SUPPORTED_OUTPUT_FORMATS = new Set(['avif', 'jpeg', 'png', 'webp'] as const)

interface ParsedImageRequest {
  filePath: string
  format: ImageOutputFormat | null
  widths: number[]
}

interface LoadedImage {
  format: string
  height: number
  source: Buffer
  width: number
}

interface ImageVariantAsset {
  buffer: Buffer
  format: string
  height: number
  width: number
}

type PluginContext = {
  emitFile: (emittedFile: {
    fileName?: string
    name?: string
    source: string | Uint8Array
    type: 'asset'
  }) => string
}

const splitId = (id: string) => {
  const queryIndex = id.indexOf('?')
  return queryIndex === -1
    ? { pathname: id, query: '' }
    : {
        pathname: id.slice(0, queryIndex),
        query: id.slice(queryIndex + 1),
      }
}

const toOutputExtension = (format: string) => (format === 'jpeg' ? 'jpg' : format)
export const createBuildAssetUrl = (fileName: string) => `/${fileName.replace(/^\/+/, '')}`

export const toContentType = (format: string) => {
  if (format === 'svg') {
    return 'image/svg+xml'
  }
  if (format === 'jpeg') {
    return 'image/jpeg'
  }
  return `image/${toOutputExtension(format)}`
}

const toRoundedHeight = (sourceWidth: number, sourceHeight: number, targetWidth: number) =>
  Math.max(1, Math.round((sourceHeight * targetWidth) / sourceWidth))

export const resolveImageWidths = (sourceWidth: number, configuredWidths: readonly number[]) => {
  const widths = configuredWidths
    .map((value) => Math.floor(value))
    .filter((value) => Number.isFinite(value) && value > 0 && value < sourceWidth)
    .sort((left, right) => left - right)

  return [...new Set(widths), sourceWidth]
}

export const readLocalImage = async (filePath: string): Promise<LoadedImage> => {
  const source = await fs.readFile(filePath)
  const metadata = await sharp(source, { animated: true }).metadata()
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error(`Unable to read image metadata for ${filePath}`)
  }

  return {
    format: metadata.format,
    height: metadata.height,
    source,
    width: metadata.width,
  }
}

const resolveRealPath = async (filePath: string) => {
  const resolvedPath = path.resolve(filePath)
  try {
    return await fs.realpath(resolvedPath)
  } catch {
    return resolvedPath
  }
}

const isInsideDirectory = (filePath: string, directoryPath: string) => {
  const relative = path.relative(directoryPath, filePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export const isAllowedImagePath = async (
  filePath: string,
  config: Pick<ResolvedConfig, 'root' | 'server'>,
) => {
  const allowedRoots = new Set<string>()
  for (const allowedPath of [config.root, ...(config.server.fs.allow ?? [])]) {
    allowedRoots.add(await resolveRealPath(path.resolve(config.root, allowedPath)))
  }

  const resolvedFilePath = await resolveRealPath(filePath)
  for (const allowedRoot of allowedRoots) {
    if (isInsideDirectory(resolvedFilePath, allowedRoot)) {
      return true
    }
  }
  return false
}

const parseWidths = (value: string | null) =>
  value
    ?.split(/[;,]/)
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part > 0) ?? []

const normalizeOutputFormat = (
  sourceFormat: string,
  requestedFormat: ImageOutputFormat | null,
  configuredFormats: readonly ImageOutputFormat[],
): ImageOutputFormat | null => {
  if (requestedFormat) {
    return requestedFormat
  }
  if (sourceFormat === 'svg') {
    return null
  }
  if (SUPPORTED_OUTPUT_FORMATS.has(sourceFormat as ImageOutputFormat)) {
    return sourceFormat as ImageOutputFormat
  }
  return configuredFormats[0] ?? 'webp'
}

const parseImageRequest = (id: string, options: EclipsaImageOptions): ParsedImageRequest | null => {
  const { pathname, query } = splitId(id)
  const params = new URLSearchParams(query)
  if (!params.has(IMAGE_QUERY_FLAG)) {
    return null
  }

  const format = params.get('format')
  if (format && !SUPPORTED_OUTPUT_FORMATS.has(format as ImageOutputFormat)) {
    throw new Error(
      `Unsupported @eclipsa/image format "${format}". Expected one of avif, jpeg, png, webp.`,
    )
  }

  const widths = parseWidths(params.get('widths'))

  return {
    filePath: pathname,
    format: (format as ImageOutputFormat | null) ?? null,
    widths: widths.length > 0 ? widths : (options.widths ?? [...DEFAULT_WIDTHS]),
  }
}

const applyOutputFormat = (pipeline: sharp.Sharp, format: ImageOutputFormat, quality: number) => {
  switch (format) {
    case 'avif':
      return pipeline.avif({ quality })
    case 'jpeg':
      return pipeline.jpeg({ mozjpeg: true, quality })
    case 'png':
      return pipeline.png({ compressionLevel: 9, quality })
    case 'webp':
      return pipeline.webp({ quality })
  }
}

const buildVariantAssets = async (
  image: LoadedImage,
  variantWidths: readonly number[],
  format: ImageOutputFormat | null,
  quality: number,
): Promise<ImageVariantAsset[]> => {
  if (format === null) {
    return [
      {
        buffer: image.source,
        format: image.format,
        height: image.height,
        width: image.width,
      },
    ]
  }

  return Promise.all(
    variantWidths.map(async (width) => {
      const targetHeight = toRoundedHeight(image.width, image.height, width)
      const resized = await applyOutputFormat(
        sharp(image.source, { animated: true }).resize({
          fit: 'inside',
          height: targetHeight,
          width,
          withoutEnlargement: true,
        }),
        format,
        quality,
      ).toBuffer()

      return {
        buffer: resized,
        format,
        height: targetHeight,
        width,
      }
    }),
  )
}

export const createAssetName = (filePath: string, width: number, format: string) => {
  const fileName = path.basename(filePath, path.extname(filePath))
  const fileHash = createHash('sha1').update(path.normalize(filePath)).digest('hex').slice(0, 8)
  return `${fileName}-${fileHash}-${width}w.${toOutputExtension(format)}`
}

const createBuildModule = (
  variants: ImageVariantAsset[],
  filePath: string,
  emitFile: PluginContext['emitFile'],
  emittedAssetReferenceIds: Set<string>,
) => {
  const references = variants.map((variant) =>
    emitFile({
      fileName: `assets/${createAssetName(filePath, variant.width, variant.format)}`,
      name: createAssetName(filePath, variant.width, variant.format),
      source: variant.buffer,
      type: 'asset',
    }),
  )
  for (const referenceId of references) {
    emittedAssetReferenceIds.add(referenceId)
  }
  const sourceIndex = variants.length - 1

  return `const variants = [
${variants
  .map(
    (variant, index) =>
      `  { format: ${JSON.stringify(variant.format)}, height: ${variant.height}, src: import.meta.ROLLUP_FILE_URL_${references[index]}, width: ${variant.width} },`,
  )
  .join('\n')}
];

export default {
  format: ${JSON.stringify(variants[sourceIndex]!.format)},
  height: ${variants[sourceIndex]!.height},
  src: import.meta.ROLLUP_FILE_URL_${references[sourceIndex]!},
  variants,
  width: ${variants[sourceIndex]!.width},
};
`
}

const createDevModule = (variants: ImageVariantAsset[], filePath: string) => {
  const sourceIndex = variants.length - 1
  const entries = variants.map((variant) => {
    const params = new URLSearchParams({
      format: variant.format,
      path: filePath,
      width: String(variant.width),
    })
    return {
      format: variant.format,
      height: variant.height,
      src: `${DEV_IMAGE_ENDPOINT}?${params.toString()}`,
      width: variant.width,
    }
  })

  return `const variants = ${JSON.stringify(entries)};

export default {
  format: ${JSON.stringify(entries[sourceIndex]!.format)},
  height: ${entries[sourceIndex]!.height},
  src: ${JSON.stringify(entries[sourceIndex]!.src)},
  variants,
  width: ${entries[sourceIndex]!.width},
};
`
}

const writeDevImageResponse = async (
  req: IncomingMessage,
  res: ServerResponse,
  config: Pick<ResolvedConfig, 'root' | 'server'>,
) => {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost')
  if (requestUrl.pathname !== DEV_IMAGE_ENDPOINT) {
    return false
  }

  const filePath = requestUrl.searchParams.get('path')
  const width = Number(requestUrl.searchParams.get('width'))
  const format = requestUrl.searchParams.get('format')
  if (!filePath || !Number.isFinite(width) || width <= 0) {
    res.statusCode = 400
    res.end('Invalid image request.')
    return true
  }

  if (!(await isAllowedImagePath(filePath, config))) {
    res.statusCode = 403
    res.end('Image path is not allowed.')
    return true
  }

  const image = await readLocalImage(filePath)
  if (format === 'svg') {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'image/svg+xml')
    res.end(image.source)
    return true
  }

  if (!format || !SUPPORTED_OUTPUT_FORMATS.has(format as ImageOutputFormat)) {
    res.statusCode = 400
    res.end('Invalid image format.')
    return true
  }

  const [variant] = await buildVariantAssets(
    image,
    [Math.min(width, image.width)],
    format as ImageOutputFormat,
    DEFAULT_QUALITY,
  )
  if (!variant) {
    res.statusCode = 500
    res.end('Failed to render image variant.')
    return true
  }

  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', toContentType(variant.format))
  res.end(variant.buffer)
  return true
}

export const eclipsaImage = (options: EclipsaImageOptions = {}): Plugin => {
  let config: ResolvedConfig | null = null
  const emittedAssetReferenceIds = new Set<string>()

  return {
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (!config) {
            next(new Error('vite-plugin-eclipsa-image requires a resolved Vite config.'))
            return
          }
          if (await writeDevImageResponse(req, res, config)) {
            return
          }
        } catch (error) {
          next(error as Error)
          return
        }
        next()
      })
    },
    enforce: 'pre',
    async load(id) {
      const resolved = id.startsWith(VIRTUAL_IMAGE_PREFIX)
        ? parseImageRequest(id.slice(VIRTUAL_IMAGE_PREFIX.length), options)
        : null
      if (!resolved) {
        return null
      }

      const image = await readLocalImage(resolved.filePath)
      const format = normalizeOutputFormat(image.format, resolved.format, options.formats ?? [])
      const widths =
        format === null ? [image.width] : resolveImageWidths(image.width, resolved.widths)
      const variants = await buildVariantAssets(
        image,
        widths,
        format,
        options.quality ?? DEFAULT_QUALITY,
      )

      return config?.command === 'build'
        ? createBuildModule(
            variants,
            resolved.filePath,
            this.emitFile.bind(this),
            emittedAssetReferenceIds,
          )
        : createDevModule(variants, resolved.filePath)
    },
    name: 'vite-plugin-eclipsa-image',
    resolveFileUrl({ fileName, referenceId }) {
      if (!emittedAssetReferenceIds.has(referenceId)) {
        return null
      }
      return JSON.stringify(createBuildAssetUrl(fileName))
    },
    async resolveId(source, importer) {
      const requested = parseImageRequest(source, options)
      if (!requested) {
        return null
      }

      const resolved = await this.resolve(requested.filePath, importer, { skipSelf: true })
      if (!resolved) {
        return null
      }

      const params = new URLSearchParams(splitId(source).query)
      return `${VIRTUAL_IMAGE_PREFIX}${resolved.id}?${params.toString()}`
    },
  }
}
