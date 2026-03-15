import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import type { JSX } from '../jsx/jsx-runtime.ts'
import type { RouteParams } from './router-shared.ts'

export const ROUTE_METADATA_HEAD_ATTR = 'data-e-metadata'

export interface MetadataContext {
  params: RouteParams
  url: URL
}

export interface OpenGraphMetadata {
  description?: string
  images?: string[]
  title?: string
  type?: string
  url?: string
}

export interface TwitterMetadata {
  card?: string
  description?: string
  images?: string[]
  title?: string
}

export interface RouteMetadata {
  canonical?: string
  description?: string
  openGraph?: OpenGraphMetadata
  title?: string
  twitter?: TwitterMetadata
}

export type RouteMetadataValue = RouteMetadata | null | undefined
export type RouteMetadataResolver = (ctx: MetadataContext) => RouteMetadataValue
export type RouteMetadataExport = RouteMetadataValue | RouteMetadataResolver

const mergeDefined = <T extends object>(parent: T | undefined, child: T | undefined) => {
  if (!parent) {
    return child
  }
  if (!child) {
    return parent
  }
  return Object.fromEntries(
    [...new Set([...Object.keys(parent), ...Object.keys(child)])].flatMap((key) => {
      const value = (child as Record<string, unknown>)[key]
      return value === undefined
        ? [[key, (parent as Record<string, unknown>)[key]]]
        : [[key, value]]
    }),
  ) as T
}

const mergeRouteMetadata = (parent: RouteMetadata | null, child: RouteMetadata | null) => {
  if (!parent) {
    return child
  }
  if (!child) {
    return parent
  }

  return {
    canonical: child.canonical ?? parent.canonical,
    description: child.description ?? parent.description,
    openGraph: mergeDefined(parent.openGraph, child.openGraph),
    title: child.title ?? parent.title,
    twitter: mergeDefined(parent.twitter, child.twitter),
  } satisfies RouteMetadata
}

export const resolveRouteMetadata = (
  value: RouteMetadataExport,
  ctx: MetadataContext,
): RouteMetadata | null => {
  if (!value) {
    return null
  }
  const resolved = typeof value === 'function' ? value(ctx) : value
  return resolved ?? null
}

export const composeRouteMetadata = (
  values: RouteMetadataExport[],
  ctx: MetadataContext,
): RouteMetadata | null =>
  values.reduce<RouteMetadata | null>(
    (current, value) => mergeRouteMetadata(current, resolveRouteMetadata(value, ctx)),
    null,
  )

export const renderRouteMetadataHead = (metadata: RouteMetadata | null): JSX.Element[] => {
  if (!metadata) {
    return []
  }

  const elements: JSX.Element[] = []

  if (metadata.title) {
    elements.push(
      jsxDEV(
        'title',
        {
          [ROUTE_METADATA_HEAD_ATTR]: '',
          children: metadata.title,
        },
        null,
        true,
        {},
      ),
    )
  }

  if (metadata.description) {
    elements.push(
      jsxDEV(
        'meta',
        {
          [ROUTE_METADATA_HEAD_ATTR]: '',
          content: metadata.description,
          name: 'description',
        },
        null,
        true,
        {},
      ),
    )
  }

  if (metadata.canonical) {
    elements.push(
      jsxDEV(
        'link',
        {
          [ROUTE_METADATA_HEAD_ATTR]: '',
          href: metadata.canonical,
          rel: 'canonical',
        },
        null,
        true,
        {},
      ),
    )
  }

  if (metadata.openGraph?.title) {
    elements.push(
      jsxDEV(
        'meta',
        {
          [ROUTE_METADATA_HEAD_ATTR]: '',
          content: metadata.openGraph.title,
          property: 'og:title',
        },
        null,
        true,
        {},
      ),
    )
  }
  if (metadata.openGraph?.description) {
    elements.push(
      jsxDEV(
        'meta',
        {
          [ROUTE_METADATA_HEAD_ATTR]: '',
          content: metadata.openGraph.description,
          property: 'og:description',
        },
        null,
        true,
        {},
      ),
    )
  }
  if (metadata.openGraph?.type) {
    elements.push(
      jsxDEV(
        'meta',
        {
          [ROUTE_METADATA_HEAD_ATTR]: '',
          content: metadata.openGraph.type,
          property: 'og:type',
        },
        null,
        true,
        {},
      ),
    )
  }
  if (metadata.openGraph?.url) {
    elements.push(
      jsxDEV(
        'meta',
        {
          [ROUTE_METADATA_HEAD_ATTR]: '',
          content: metadata.openGraph.url,
          property: 'og:url',
        },
        null,
        true,
        {},
      ),
    )
  }
  for (const image of metadata.openGraph?.images ?? []) {
    elements.push(
      jsxDEV(
        'meta',
        {
          [ROUTE_METADATA_HEAD_ATTR]: '',
          content: image,
          property: 'og:image',
        },
        image,
        true,
        {},
      ),
    )
  }

  if (metadata.twitter?.card) {
    elements.push(
      jsxDEV(
        'meta',
        {
          [ROUTE_METADATA_HEAD_ATTR]: '',
          content: metadata.twitter.card,
          name: 'twitter:card',
        },
        null,
        true,
        {},
      ),
    )
  }
  if (metadata.twitter?.title) {
    elements.push(
      jsxDEV(
        'meta',
        {
          [ROUTE_METADATA_HEAD_ATTR]: '',
          content: metadata.twitter.title,
          name: 'twitter:title',
        },
        null,
        true,
        {},
      ),
    )
  }
  if (metadata.twitter?.description) {
    elements.push(
      jsxDEV(
        'meta',
        {
          [ROUTE_METADATA_HEAD_ATTR]: '',
          content: metadata.twitter.description,
          name: 'twitter:description',
        },
        null,
        true,
        {},
      ),
    )
  }
  for (const image of metadata.twitter?.images ?? []) {
    elements.push(
      jsxDEV(
        'meta',
        {
          [ROUTE_METADATA_HEAD_ATTR]: '',
          content: image,
          name: 'twitter:image',
        },
        image,
        true,
        {},
      ),
    )
  }

  return elements
}
