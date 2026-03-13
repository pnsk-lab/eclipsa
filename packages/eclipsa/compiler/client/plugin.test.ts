// @ts-types="@types/babel__core"
import { transform } from '@babel/core'
import { describe, expect, it } from 'vitest'
import { pluginClientJSX } from './plugin.ts'

describe('compiler/client pluginClientJSX', () => {
  it('injects the shared client runtime imports', () => {
    const resultCode = transform(
      `<div a="a">
        <Header a="a" />
      </div>`,
      {
        filename: 'plugin.test.tsx',
        parserOpts: {
          plugins: ['jsx'],
        },
        plugins: [pluginClientJSX({ hmr: false })],
      },
    )?.code

    expect(resultCode).toBeTruthy()
    expect(resultCode).toContain('from "eclipsa/client"')
    expect(resultCode).not.toContain('from "eclipsa/dev-client"')
    expect(resultCode).toContain('createTemplate')
    expect(resultCode).toContain('createComponent')
  })

  it('injects HMR helpers only when enabled', () => {
    const resultCode = transform(`<div />`, {
      filename: 'plugin.test.tsx',
      parserOpts: {
        plugins: ['jsx'],
      },
      plugins: [pluginClientJSX({ hmr: true })],
    })?.code

    expect(resultCode).toContain('from "eclipsa/dev-client"')
    expect(resultCode).toContain('initHot')
    expect(resultCode).toContain('defineHotComponent')
    expect(resultCode).toContain('createHotRegistry')
  })

  it('passes component children through props', () => {
    const resultCode = transform(`<Link href="/">Home</Link>`, {
      filename: 'plugin.test.tsx',
      parserOpts: {
        plugins: ['jsx'],
      },
      plugins: [pluginClientJSX({ hmr: false })],
    })?.code

    expect(resultCode).toContain('children')
    expect(resultCode).toContain('Home')
  })

  it('preserves source order between component and expression inserts', () => {
    const resultCode = transform(`<div><Header /><main>{props.children}</main></div>`, {
      filename: 'plugin.test.tsx',
      parserOpts: {
        plugins: ['jsx'],
      },
      plugins: [pluginClientJSX({ hmr: false })],
    })?.code

    expect(resultCode).toBeTruthy()
    const headerInsertIndex = resultCode!.indexOf('_insert(_createComponent(Header')
    const childrenInsertIndex = resultCode!.indexOf('_insert(() => props.children')
    expect(headerInsertIndex).toBeGreaterThanOrEqual(0)
    expect(childrenInsertIndex).toBeGreaterThanOrEqual(0)
    expect(headerInsertIndex).toBeLessThan(childrenInsertIndex)
  })
})
