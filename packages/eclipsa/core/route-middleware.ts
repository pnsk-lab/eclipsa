import type { Env, MiddlewareHandler } from 'hono/types'
import type { WithAppEnv } from './hooks.ts'

export type RouteMiddleware<E extends Env = Env> = MiddlewareHandler<WithAppEnv<E>>
