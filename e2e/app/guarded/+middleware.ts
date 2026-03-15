import type { RouteMiddleware } from 'eclipsa'

const middleware: RouteMiddleware = async (c, next) => {
  if (new URL(c.req.url).searchParams.get('allow') === '1') {
    await next()
    return
  }
  return c.redirect('/counter')
}

export default middleware
