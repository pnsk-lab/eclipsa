// @ts-types="@types/babel__traverse"
import type { Visitor } from '@babel/traverse'
import SyntaxJSX from '@babel/plugin-syntax-jsx'
import { getJSXType, transformChildren, transformProps } from '../utils/jsx.ts'
import * as t from '@babel/types'

const EVENT_ATTR_REGEX = /^on[A-Z].+\$$/

export const pluginClientDevJSX = () => {
  let createTemplate!: t.Identifier
  let insert!: t.Identifier
  let addListener!: t.Identifier
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
          addListener = path.scope.generateUidIdentifier('addListener')
          createComponent = path.scope.generateUidIdentifier('createComponent')

          const importDeclaration = t.importDeclaration([
            t.importSpecifier(createTemplate, t.identifier('createTemplate')),
            t.importSpecifier(insert, t.identifier('insert')),
            t.importSpecifier(addListener, t.identifier('addListener')),
            t.importSpecifier(createComponent, t.identifier('createComponent')),
          ], t.stringLiteral('@xely/eclipsa/dev-client'))
          path.unshiftContainer('body', importDeclaration)
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
        const eventListeners: {
          path: Path
          eventName: string
          listener: t.Expression
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
              if (EVENT_ATTR_REGEX.test(name)) {
                // Add Event Listener
                const eventName = name.slice(2, -1).toLowerCase()
                if (attr.value?.type !== 'JSXExpressionContainer') {
                  throw new Error(
                    `${attr.value?.type} as a event handler is not supported`,
                  )
                }
                const expr = attr.value.expression
                if (t.isJSXEmptyExpression(expr)) {
                  throw new Error(
                    'JSXEmptyExpression as a event handler is not supported.',
                  )
                }
                eventListeners.push({
                  path,
                  eventName,
                  listener: expr,
                })
              }
              continue
            }
            throw new Error(`${attr.type} is not supported.`)
          }
          const jsxType = getJSXType(elem.openingElement)
          if (jsxType.type === 'element') {
            // Element
            return `<${jsxType.name}>${
              processChildren(elem.children, path)
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
        const eventDecolations = eventListeners.map((
          { path, eventName, listener },
        ) =>
          t.expressionStatement(t.callExpression(addListener, [
            createParentAndMarker(path).marker,
            t.stringLiteral(eventName),
            listener,
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
        const iife = t.callExpression(
          t.arrowFunctionExpression(
            [],
            t.blockStatement([
              varDecolation,
              ...insertDecolations,
              ...eventDecolations,
              ...componentDecolations,
              t.returnStatement(clonedID),
            ]),
          ),
          [],
        )
        path.replaceWith(iife)
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
