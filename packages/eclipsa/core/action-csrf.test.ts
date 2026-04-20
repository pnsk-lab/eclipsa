import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { ACTION_FORM_ATTR } from './action.ts'
import { ACTION_CSRF_COOKIE, applyActionCsrfCookie } from './action-csrf.ts'
import type { AppContext } from './hooks.ts'
import { withServerRequestContext } from './hooks.ts'
import { renderSSR } from './ssr.ts'
import { jsxDEV, ssrRaw } from '../jsx/jsx-dev-runtime.ts'

describe('action csrf', () => {
  it('injects csrf inputs into SSR action forms and appends the csrf cookie', async () => {
    const app = new Hono()
    app.get('/form', (c) =>
      withServerRequestContext(c as unknown as AppContext, {}, () => {
        const { html } = renderSSR(() =>
          jsxDEV(
            'form',
            {
              [ACTION_FORM_ATTR]: 'sum',
              children: jsxDEV('button', { children: 'Submit' }, null, false, {}),
              method: 'post',
            },
            null,
            false,
            {},
          ),
        )

        return applyActionCsrfCookie(
          new Response(html, {
            headers: {
              'content-type': 'text/html; charset=utf-8',
            },
          }),
          c as unknown as AppContext,
        )
      }),
    )

    const response = await app.request('http://localhost/form')
    const cookie = response.headers.get('set-cookie')
    const html = await response.text()

    expect(cookie).toContain(`${ACTION_CSRF_COOKIE}=`)
    const encodedToken = cookie?.match(new RegExp(`${ACTION_CSRF_COOKIE}=([^;]+)`))?.[1]
    expect(encodedToken).toBeTruthy()
    expect(html).toContain('data-e-action-csrf=""')
    expect(html).toContain('name="__e_csrf"')
    expect(html).toContain(`value="${decodeURIComponent(encodedToken!)}"`)
  })

  it('injects csrf inputs into raw SSR action forms before returning HTML', async () => {
    const app = new Hono()
    app.get('/form', (c) =>
      withServerRequestContext(c as unknown as AppContext, {}, () => {
        const { html } = renderSSR(() =>
          ssrRaw(
            '<form data-e-action-form="sum" method="post">' +
              '<input name="__e_action" type="hidden" value="sum"></input>' +
              '<button>Submit</button>' +
              '</form>',
          ),
        )

        return applyActionCsrfCookie(
          new Response(html, {
            headers: {
              'content-type': 'text/html; charset=utf-8',
            },
          }),
          c as unknown as AppContext,
        )
      }),
    )

    const response = await app.request('http://localhost/form')
    const cookie = response.headers.get('set-cookie')
    const html = await response.text()

    expect(cookie).toContain(`${ACTION_CSRF_COOKIE}=`)
    const encodedToken = cookie?.match(new RegExp(`${ACTION_CSRF_COOKIE}=([^;]+)`))?.[1]
    expect(encodedToken).toBeTruthy()
    expect(html).toContain('data-e-action-csrf=""')
    expect(html).toContain('name="__e_csrf"')
    expect(html).toContain(`value="${decodeURIComponent(encodedToken!)}"`)
  })
})
