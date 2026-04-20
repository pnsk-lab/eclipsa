import { getCurrentServerRequestContext, type AppContext } from './hooks.ts'

export const ACTION_CSRF_COOKIE = '__eclipsa_action_csrf'
export const ACTION_CSRF_FIELD = '__e_csrf'
export const ACTION_CSRF_HEADER = 'x-eclipsa-csrf'
export const ACTION_CSRF_INPUT_ATTR = 'data-e-action-csrf'
export const ACTION_CSRF_ERROR_MESSAGE = 'Invalid CSRF token.'
const ACTION_FORM_ATTR = 'data-e-action-form'

const ACTION_CSRF_TOKEN_KEY = Symbol.for('eclipsa.action-csrf-token')
const ACTION_CSRF_SET_COOKIE_KEY = Symbol.for('eclipsa.action-csrf-set-cookie')

type ActionCsrfContext = AppContext<any> & {
  [ACTION_CSRF_SET_COOKIE_KEY]?: boolean
  [ACTION_CSRF_TOKEN_KEY]?: string
}

const getCrypto = () => {
  if (globalThis.crypto) {
    return globalThis.crypto
  }
  const nodeCrypto =
    typeof process === 'undefined'
      ? undefined
      : ((
          process as typeof process & {
            getBuiltinModule?: (id: string) => unknown
          }
        ).getBuiltinModule?.('node:crypto') as
          | {
              webcrypto?: Crypto
            }
          | undefined)
  if (nodeCrypto?.webcrypto) {
    return nodeCrypto.webcrypto
  }
  throw new Error('Web Crypto API is not available in this environment.')
}

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')

export const createActionCsrfToken = () => {
  const bytes = new Uint8Array(32)
  getCrypto().getRandomValues(bytes)
  return toHex(bytes)
}

const parseCookie = (cookieHeader: string | null | undefined, name: string) => {
  if (!cookieHeader) {
    return null
  }

  for (const entry of cookieHeader.split(';')) {
    const trimmed = entry.trim()
    if (!trimmed.startsWith(`${name}=`)) {
      continue
    }
    const value = trimmed.slice(name.length + 1)
    if (value.length === 0) {
      return null
    }
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  return null
}

const shouldUseSecureCookie = (c: AppContext<any>) => {
  try {
    if (new URL(c.req.raw.url).protocol === 'https:') {
      return true
    }
  } catch {}
  const forwardedProto = c.req.header('x-forwarded-proto')
  return forwardedProto?.split(',')[0]?.trim().toLowerCase() === 'https'
}

export const readActionCsrfTokenFromCookieHeader = (cookieHeader: string | null | undefined) =>
  parseCookie(cookieHeader, ACTION_CSRF_COOKIE)

export const readActionCsrfTokenFromDocument = (doc: Pick<Document, 'cookie'>) =>
  readActionCsrfTokenFromCookieHeader(doc.cookie)

export const readActionCsrfTokenFromFormData = (value: FormData) => {
  const token = value.get(ACTION_CSRF_FIELD)
  return typeof token === 'string' && token.length > 0 ? token : null
}

export const readActionCsrfTokenFromRequest = (c: AppContext<any>) =>
  readActionCsrfTokenFromCookieHeader(c.req.header('cookie'))

export const ensureActionCsrfToken = (c: AppContext<any>) => {
  const record = c as ActionCsrfContext
  const existing = record[ACTION_CSRF_TOKEN_KEY]
  if (typeof existing === 'string' && existing.length > 0) {
    return existing
  }

  const cookieToken = readActionCsrfTokenFromRequest(c)
  if (cookieToken) {
    record[ACTION_CSRF_TOKEN_KEY] = cookieToken
    record[ACTION_CSRF_SET_COOKIE_KEY] = false
    return cookieToken
  }

  const created = createActionCsrfToken()
  record[ACTION_CSRF_TOKEN_KEY] = created
  record[ACTION_CSRF_SET_COOKIE_KEY] = true
  return created
}

export const getCurrentActionCsrfToken = () => {
  const context = getCurrentServerRequestContext()
  return context ? ensureActionCsrfToken(context) : null
}

const createActionCsrfInputHtml = (token: string) =>
  `<input ${ACTION_CSRF_INPUT_ATTR}="" name="${ACTION_CSRF_FIELD}" type="hidden" value="${token}">`

export const injectMissingActionCsrfInputs = (html: string, token: string | null | undefined) => {
  if (!token || !html.includes(ACTION_FORM_ATTR)) {
    return html
  }

  let output = ''
  let cursor = 0

  while (cursor < html.length) {
    const formStart = html.indexOf('<form', cursor)
    if (formStart < 0) {
      output += html.slice(cursor)
      break
    }

    const openEnd = html.indexOf('>', formStart)
    if (openEnd < 0) {
      output += html.slice(cursor)
      break
    }

    const openTag = html.slice(formStart, openEnd + 1)
    if (!openTag.includes(ACTION_FORM_ATTR)) {
      output += html.slice(cursor, openEnd + 1)
      cursor = openEnd + 1
      continue
    }

    const closeStart = html.indexOf('</form>', openEnd + 1)
    if (closeStart < 0) {
      output += html.slice(cursor)
      break
    }

    const formInnerHtml = html.slice(openEnd + 1, closeStart)
    output += html.slice(cursor, openEnd + 1)
    if (
      !formInnerHtml.includes(ACTION_CSRF_INPUT_ATTR) &&
      !formInnerHtml.includes(`name="${ACTION_CSRF_FIELD}"`) &&
      !formInnerHtml.includes(`name='${ACTION_CSRF_FIELD}'`)
    ) {
      output += createActionCsrfInputHtml(token)
    }
    output += formInnerHtml
    cursor = closeStart
  }

  return output
}

export const serializeActionCsrfCookie = (token: string, secure: boolean) =>
  [
    `${ACTION_CSRF_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ')

export const applyActionCsrfCookie = (response: Response, c: AppContext<any>) => {
  const record = c as ActionCsrfContext
  if (record[ACTION_CSRF_SET_COOKIE_KEY] !== true) {
    return response
  }

  const token = record[ACTION_CSRF_TOKEN_KEY]
  if (!token) {
    return response
  }

  const cookieValue = serializeActionCsrfCookie(token, shouldUseSecureCookie(c))
  try {
    response.headers.append('set-cookie', cookieValue)
  } catch {
    const next = new Response(response.body, response)
    next.headers.append('set-cookie', cookieValue)
    response = next
  }
  record[ACTION_CSRF_SET_COOKIE_KEY] = false
  return response
}
