export type ImageOutputFormat = 'avif' | 'jpeg' | 'png' | 'webp'

export interface ImageVariant {
  format: string
  height: number
  src: string
  width: number
}

export interface ImageSource {
  format: string
  height: number
  src: string
  variants: ImageVariant[]
  width: number
}

export interface ImageProps extends Record<string, unknown> {
  alt: string
  decoding?: 'async' | 'auto' | 'sync'
  height?: number
  loading?: 'eager' | 'lazy'
  sizes?: string
  src: ImageSource | string
  srcset?: string
  width?: number
}

export interface EclipsaImageOptions {
  formats?: ImageOutputFormat[]
  quality?: number
  widths?: number[]
}

const createImageElement = (props: Record<string, unknown>) => ({
  isStatic: false,
  props,
  type: 'img',
})

export const Image = ({
  alt,
  decoding = 'async',
  height,
  loading = 'lazy',
  sizes,
  src,
  srcset,
  width,
  ...props
}: ImageProps) => {
  if (typeof src === 'string') {
    return createImageElement({
      ...props,
      alt,
      decoding,
      height,
      loading,
      sizes,
      src,
      srcset,
      width,
    })
  }

  return createImageElement({
    ...props,
    alt,
    decoding,
    height: height ?? src.height,
    loading,
    sizes: sizes ?? (src.variants.length > 1 ? '100vw' : undefined),
    src: src.src,
    srcset: srcset ?? src.variants.map((variant) => `${variant.src} ${variant.width}w`).join(', '),
    width: width ?? src.width,
  })
}
