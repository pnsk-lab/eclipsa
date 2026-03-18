import { describe, expect, it } from 'vitest'

import { buildRoutePath, createRouteHref, type RoutePathParams } from './router-shared.ts'

describe('router typed APIs', () => {
  it('keeps type-safe path parameter requirements', () => {
    const validParams: RoutePathParams<'/posts/[id]/[[tab]]/[...rest]'> = {
      id: '42',
      rest: ['comments', 'latest'],
    }

    const href = createRouteHref({
      to: '/posts/[id]/[[tab]]/[...rest]',
      params: validParams,
      hash: 'tail',
    })

    expect(href).toBe('/posts/42/comments/latest#tail')
    expect(buildRoutePath('/posts/[id]', { id: '99' })).toBe('/posts/99')

    const ensureTypeErrors = () => {
      // @ts-expect-error missing required path params
      createRouteHref({ to: '/posts/[id]' })

      // @ts-expect-error rest params are required on [...rest]
      buildRoutePath('/posts/[id]/[...rest]', { id: '10' })

      // @ts-expect-error unknown params are rejected
      buildRoutePath('/posts/[id]', { id: '1', extra: 'x' })
    }

    void ensureTypeErrors
  })
})
