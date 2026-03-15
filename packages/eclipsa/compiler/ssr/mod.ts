// @ts-types="@types/babel__core"
import { transformAsync, types as t } from '@babel/core'
// @ts-types="@types/babel__traverse"
import type { Visitor } from '@babel/traverse'
import SyntaxJSX from '@babel/plugin-syntax-jsx'
import {
  getJSXAttributeName,
  getJSXType,
  getJSXTypeNode,
  normalizeJSXText,
  transformChildren,
  transformProps,
} from '../shared/jsx.ts'
import { FRAGMENT } from '../../jsx/shared.ts'
import { preprocessTSX } from '../shared/source.ts'

const EVENT_PROP_REGEX = /^on[A-Z].+\$$/
const DANGEROUSLY_SET_INNER_HTML_PROP = 'dangerouslySetInnerHTML'

const escapeText = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const escapeAttr = (value: string) =>
  escapeText(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;')

const appendStaticValue = (strings: string[], value: string) => {
  strings[strings.length - 1] += value
}

const appendDynamicValue = (strings: string[], values: t.Expression[], value: t.Expression) => {
  values.push(value)
  strings.push('')
}

const tryRenderStaticTextExpression = (value: t.Expression) => {
  if (t.isStringLiteral(value)) {
    return escapeText(value.value)
  }
  if (t.isNumericLiteral(value) || t.isBooleanLiteral(value)) {
    return escapeText(String(value.value))
  }
  if (t.isBigIntLiteral(value)) {
    return escapeText(value.value)
  }
  if (t.isNullLiteral(value)) {
    return ''
  }
  return null
}

const tryRenderStaticAttrExpression = (name: string, value: t.Expression) => {
  if (t.isNullLiteral(value)) {
    return ''
  }
  if (t.isBooleanLiteral(value)) {
    return value.value ? ` ${name}` : ''
  }
  if (t.isStringLiteral(value)) {
    return ` ${name}="${escapeAttr(value.value)}"`
  }
  if (t.isNumericLiteral(value)) {
    return ` ${name}="${escapeAttr(String(value.value))}"`
  }
  if (t.isBigIntLiteral(value)) {
    return ` ${name}="${escapeAttr(value.value)}"`
  }
  return null
}

const buildSSRTemplateExpression = (
  node: t.JSXElement | t.JSXFragment,
): t.CallExpression | null => {
  const strings = ['']
  const values: t.Expression[] = []

  const appendChild = (
    child: t.JSXElement | t.JSXFragment | t.JSXExpressionContainer | t.JSXText,
  ) => {
    if (t.isJSXText(child)) {
      const normalized = normalizeJSXText(child.value)
      if (normalized !== null) {
        appendStaticValue(strings, escapeText(normalized))
      }
      return true
    }

    if (t.isJSXExpressionContainer(child)) {
      if (t.isJSXEmptyExpression(child.expression)) {
        return true
      }
      const staticText = tryRenderStaticTextExpression(child.expression)
      if (staticText !== null) {
        appendStaticValue(strings, staticText)
        return true
      }
      appendDynamicValue(strings, values, t.cloneNode(child.expression, true))
      return true
    }

    const nested = buildSSRTemplateExpression(child)
    appendDynamicValue(strings, values, nested ?? t.cloneNode(child, true))
    return true
  }

  if (t.isJSXElement(node)) {
    const openingElement = node.openingElement
    const jsxType = getJSXType(openingElement)
    if (jsxType.type !== 'element' || jsxType.name === 'body') {
      return null
    }

    appendStaticValue(strings, `<${jsxType.name}`)

    for (const attribute of openingElement.attributes) {
      if (t.isJSXSpreadAttribute(attribute)) {
        return null
      }

      const name = getJSXAttributeName(attribute.name)
      if (
        name === 'ref' ||
        name === DANGEROUSLY_SET_INNER_HTML_PROP ||
        EVENT_PROP_REGEX.test(name)
      ) {
        return null
      }

      if (attribute.value === null) {
        appendStaticValue(strings, ` ${name}`)
        continue
      }

      if (t.isStringLiteral(attribute.value)) {
        appendStaticValue(strings, ` ${name}="${escapeAttr(attribute.value.value)}"`)
        continue
      }

      if (t.isJSXExpressionContainer(attribute.value)) {
        if (t.isJSXEmptyExpression(attribute.value.expression)) {
          continue
        }
        const staticAttr = tryRenderStaticAttrExpression(name, attribute.value.expression)
        if (staticAttr !== null) {
          appendStaticValue(strings, staticAttr)
          continue
        }
        appendDynamicValue(
          strings,
          values,
          t.callExpression(t.identifier('ssrAttr'), [
            t.stringLiteral(name),
            t.cloneNode(attribute.value.expression, true),
          ]),
        )
        continue
      }

      return null
    }

    appendStaticValue(strings, '>')
    for (const child of node.children) {
      if (t.isJSXSpreadChild(child) || !appendChild(child)) {
        return null
      }
    }
    appendStaticValue(strings, `</${jsxType.name}>`)
  } else {
    for (const child of node.children) {
      if (t.isJSXSpreadChild(child) || !appendChild(child)) {
        return null
      }
    }
  }

  return t.callExpression(t.identifier('ssrTemplate'), [
    t.arrayExpression(strings.map((entry) => t.stringLiteral(entry))),
    ...values,
  ])
}

const pluginJSXRuntime = () => ({
  inherits: SyntaxJSX.default,
  visitor: {
    Program: {
      enter(path) {
        const jsxDEV = t.identifier('jsxDEV')
        const ssrAttr = t.identifier('ssrAttr')
        const ssrTemplate = t.identifier('ssrTemplate')
        path.unshiftContainer(
          'body',
          t.importDeclaration(
            [
              t.importSpecifier(jsxDEV, jsxDEV),
              t.importSpecifier(ssrAttr, ssrAttr),
              t.importSpecifier(ssrTemplate, ssrTemplate),
            ],
            t.stringLiteral('eclipsa/jsx-dev-runtime'),
          ),
        )
      },
    },
    JSXElement(path) {
      const fastPath = buildSSRTemplateExpression(path.node)
      if (fastPath) {
        path.replaceWith(fastPath)
        return
      }

      const openingElement = path.node.openingElement
      const type = getJSXType(openingElement)
      const jsxTypeExpr = getJSXTypeNode(type)
      const { props, key } = transformProps(openingElement)
      const children = transformChildren(path.node)
      props.properties.push(t.objectProperty(t.stringLiteral('children'), children))

      path.replaceWith(
        t.callExpression(t.identifier('jsxDEV'), [
          jsxTypeExpr,
          props,
          key ?? t.nullLiteral(),
          t.booleanLiteral(false),
          t.objectExpression([]),
        ]),
      )
    },
    JSXFragment(path) {
      const fastPath = buildSSRTemplateExpression(path.node)
      if (fastPath) {
        path.replaceWith(fastPath)
        return
      }

      const fragmentString = t.jsxIdentifier(FRAGMENT)
      path.replaceWith(
        t.jsxElement(
          t.jsxOpeningElement(fragmentString, [], true),
          t.jsxClosingElement(fragmentString),
          path.node.children,
        ),
      )
    },
  } satisfies Visitor,
})

export const compileSSRModule = async (code: string, id: string): Promise<string> => {
  const preprocessed = await preprocessTSX(code, id)
  const resultCode = (
    await transformAsync(preprocessed.code, {
      filename: id,
      parserOpts: {
        sourceType: 'module',
        plugins: ['jsx'],
      },
      plugins: [pluginJSXRuntime()],
      sourceMaps: 'inline',
    })
  )?.code

  if (!resultCode) {
    throw new Error('Compiling JSX was failed.')
  }
  return resultCode
}
