import type { Handle } from 'eclipsa'
import { isPlaygroundPathname, PLAYGROUND_RESPONSE_HEADERS } from './playground/isolation.ts'

export const handle: Handle = async (context, resolve) => {
  const response = await resolve(context)
  const pathname = new URL(context.req.url).pathname

  if (isPlaygroundPathname(pathname)) {
    for (const [name, value] of Object.entries(PLAYGROUND_RESPONSE_HEADERS)) {
      response.headers.set(name, value)
    }
  }

  return response
}
