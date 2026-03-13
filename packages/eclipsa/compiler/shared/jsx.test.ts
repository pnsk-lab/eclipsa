// @ts-types="@types/babel__core"
import { parseSync, types as t } from '@babel/core'
import { describe, expect, it } from 'vitest'
import { transformChildren } from './jsx.ts'

const parseJSXElement = (source: string) => {
  const parsed = parseSync(source, {
    parserOpts: {
      plugins: ['jsx'],
      sourceType: 'module',
    },
  })

  if (!parsed) {
    throw new Error('Failed to parse JSX test source.')
  }

  const statement = parsed.program.body[0]
  if (!statement || !t.isVariableDeclaration(statement)) {
    throw new Error('Expected a variable declaration.')
  }
  const declarator = statement.declarations[0]
  if (!declarator || !t.isVariableDeclarator(declarator) || !t.isJSXElement(declarator.init)) {
    throw new Error('Expected a JSX element initializer.')
  }
  return declarator.init
}

describe('transformChildren()', () => {
  it('preserves significant spaces before expressions', () => {
    const element = parseJSXElement(
      'const view = <p>loader loading: {String(loader.isLoading)}</p>',
    )
    const children = transformChildren(element)

    expect(children.elements).toHaveLength(2)
    expect(children.elements[0]).toEqual(t.stringLiteral('loader loading: '))
  })

  it('collapses multiline indentation-only boundaries without dropping content spacing', () => {
    const element = parseJSXElement(`
      const view = (
        <p>
          action last:
          {value}
        </p>
      )
    `)
    const children = transformChildren(element)

    expect(children.elements).toHaveLength(2)
    expect(children.elements[0]).toEqual(t.stringLiteral('action last:'))
  })
})
