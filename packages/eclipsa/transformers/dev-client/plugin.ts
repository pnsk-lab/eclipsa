// @ts-types="@types/babel__traverse"
import type { Visitor } from '@babel/traverse'
import SyntaxJSX from '@babel/plugin-syntax-jsx'
import { getJSXType, transformChildren, transformProps } from '../utils/jsx.ts'
import * as t from '@babel/types'

export const pluginClientDevJSX = () => {
  let createTemplate!: t.Identifier
  let insert!: t.Identifier
  let attr!: t.Identifier
  let createComponent!: t.Identifier

  const templates: {
    id: t.Identifier
    tmpl: string
  }[] = []

  return {
    inherits: SyntaxJSX.default,
    visitor: {
      Program: {
        enter(path) {
          createTemplate = path.scope.generateUidIdentifier('createTemplate')
          insert = path.scope.generateUidIdentifier('insert')
          attr = path.scope.generateUidIdentifier('attr')
          createComponent = path.scope.generateUidIdentifier('createComponent')
          const initHot = path.scope.generateUidIdentifier('initHot')

          const importDeclaration = t.importDeclaration([
            t.importSpecifier(createTemplate, t.identifier('createTemplate')),
            t.importSpecifier(insert, t.identifier('insert')),
            t.importSpecifier(attr, t.identifier('attr')),
            t.importSpecifier(createComponent, t.identifier('createComponent')),
            t.importSpecifier(initHot, t.identifier('initHot'))
          ], t.stringLiteral('@xely/eclipsa/dev-client'))
          path.unshiftContainer('body', importDeclaration)

          path.unshiftContainer('body', t.expressionStatement(t.callExpression(initHot, [
            t.memberExpression(t.memberExpression(t.identifier('import'), t.identifier('meta')), t.identifier('hot')),
            t.memberExpression(t.memberExpression(t.identifier('import'), t.identifier('meta')), t.identifier('url'))
          ])))
        },
        exit(path) {
          for (const template of templates) {
            const declaration = t.variableDeclaration('var', [
              t.variableDeclarator(
                template.id,
                t.callExpression(createTemplate, [
                  t.stringLiteral(template.tmpl),
                ]),
              ),
            ])
            path.unshiftContainer('body', declaration)
          }
        },
      },
      JSXElement(path) {
        type Path = number[]
        const applies: {
          path: Path
          expr: t.Expression
        }[] = []
        const attrs: {
          path: Path
          name: string
          value: t.Expression
        }[] = []
        const components: {
          path: Path
          id: t.Identifier
          props: t.ObjectExpression
        }[] = []
        const processChildren = (
          children: t.JSXElement['children'],
          path: Path,
        ) => {
          let text = ''
          let pathIndex = 0
          for (let i = 0; i < children.length; i++) {
            const child = children[i]
            const childPath = [...path, pathIndex]
            if (t.isJSXText(child)) {
              if (child.value.replaceAll(/[\n ]/g, '') === '') {
                continue
              }
              text += child.value
            } else if (t.isJSXExpressionContainer(child)) {
              text += `<!-- ${childPath.join(',')} -->`
              applies.push({
                expr: child.expression as t.Expression,
                path: childPath,
              })
            } else if (t.isJSXElement(child)) {
              text += processJSXElement(child, childPath)
            } else if (t.isJSXFragment(child)) {
              text += processChildren(child.children, childPath)
            } else {
              throw new Error(`${child.type} is not supported.`)
            }
            pathIndex++
          }
          return text
        }
        const processJSXElement = (
          elem: t.JSXElement,
          path: Path,
        ) => {
          for (const attr of elem.openingElement.attributes) {
            if (attr.type === 'JSXAttribute') {
              const name = typeof attr.name.name === 'string'
                ? attr.name.name
                : attr.name.name.name

              if (attr.value?.type !== 'JSXExpressionContainer' && attr.value?.type !== 'StringLiteral') {
                throw new Error(
                  `${attr.value?.type} as a event handler is not supported`,
                )
              }
              const expr = 'expression' in attr.value ? attr.value.expression : t.stringLiteral(attr.value.value)
              if (t.isJSXEmptyExpression(expr)) {
                throw new Error(
                  'JSXEmptyExpression as a event handler is not supported.',
                )
              }
              attrs.push({
                path,
                name,
                value: t.arrowFunctionExpression([], expr),
              })
              continue
            }
            throw new Error(`${attr.type} is not supported.`)
          }
          const jsxType = getJSXType(elem.openingElement)
          if (jsxType.type === 'element') {
            // Element
            return `<${jsxType.name}>${processChildren(elem.children, path)
              }</${jsxType.name}>`
          }
          // Component
          const componentId = t.identifier(jsxType.name)
          const { props } = transformProps(elem.openingElement)
          components.push({
            path,
            id: componentId,
            props
          })
          return `<!-- ${path.join(',')} -->`
        }
        const tmplHTML = processJSXElement(path.node, [])
        const tmplID = path.scope.generateUidIdentifier('template')
        templates.push({
          id: tmplID,
          tmpl: tmplHTML,
        })

        const clonedID = path.scope.generateUidIdentifier('cloned')
        const varDecolation = t.variableDeclaration('var', [
          t.variableDeclarator(clonedID, t.callExpression(tmplID, [])),
        ])
        const createParentAndMarker = (path: Path) => {
          let marker: t.Expression = clonedID
          let parent: t.Expression = clonedID
          for (let i = 0; i < path.length; i++) {
            const thisPath = path[i]
            marker = t.memberExpression(
              t.memberExpression(marker, t.identifier('childNodes')),
              t.numericLiteral(thisPath),
              true,
            )
            if (i + 2 === path.length && path.length > 1) {
              parent = marker
            }
          }
          return { marker, parent }
        }
        const insertDecolations = applies.map((apply) => {
          const { parent, marker } = createParentAndMarker(apply.path)
          return t.expressionStatement(t.callExpression(insert, [
            t.arrowFunctionExpression([], apply.expr),
            parent,
            marker,
          ]))
        })
        const eventDecolations = attrs.map((
          { path, name, value },
        ) =>
          t.expressionStatement(t.callExpression(attr, [
            createParentAndMarker(path).marker,
            t.stringLiteral(name),
            value,
          ]))
        )
        const componentDecolations = components.map((component) => {
          const { parent, marker } = createParentAndMarker(component.path)
          const createdComponent = t.callExpression(createComponent, [
            component.id,
            component.props,
          ])
          return t.expressionStatement(t.callExpression(insert, [
            createdComponent,
            parent,
            marker,
          ]))
        })
        const keyNode = path.node.openingElement.attributes.find(attr => {
          if (attr.type !== 'JSXAttribute') {
            return
          }
          return (typeof attr.name.name === 'string' ? attr.name.name : attr.name.name.name) === 'key'
        })
        const key = keyNode ? ((keyNode as t.JSXAttribute).value as t.JSXExpressionContainer).expression as t.Expression : undefined
        let resultExpr: t.Expression
        const baseElementFn = t.arrowFunctionExpression(
          [],
          t.blockStatement([
            varDecolation,
            ...insertDecolations,
            ...eventDecolations,
            ...componentDecolations,
            t.returnStatement(clonedID),
          ]),
        )
        if (key) {
          const id = t.identifier('f')
          resultExpr = t.callExpression(t.arrowFunctionExpression([], t.blockStatement([
            t.variableDeclaration('var', [
              t.variableDeclarator(id, baseElementFn)
            ]),
            t.expressionStatement(t.assignmentExpression('=', t.memberExpression(id, t.identifier('key')), key)),
            t.returnStatement(id)
          ])), [])
        } else {
          resultExpr = t.callExpression(baseElementFn, [])
        }
        path.replaceWith(resultExpr)
        /*
        const openingElement = path.node.openingElement
        const type = getJSXType(openingElement)
        const { props } = transformProps(openingElement)
        const children = transformChildren(path.node)
        props.properties.push(t.objectProperty(t.stringLiteral('children'), children))

        const fn = t.arrowFunctionExpression([], t.objectExpression([
          t.objectProperty(t.stringLiteral('type'), type),
          t.objectProperty(t.stringLiteral('props'), props),
        ]))
        path.replaceWith(fn)*/
      },
    } satisfies Visitor,
  }
}
