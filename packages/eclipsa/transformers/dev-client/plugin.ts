// @ts-types="@types/babel__traverse"
import type { Visitor } from '@babel/traverse'
import SyntaxJSX from '@babel/plugin-syntax-jsx'
import { getJSXType, transformChildren, transformProps } from '../utils/jsx.ts'
import * as t from '@babel/types'

export const pluginClientDevJSX = () => {
  let createTemplate!: t.Identifier
  let insert!: t.Identifier

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
          const importDeclaration = t.importDeclaration([
            t.importSpecifier(createTemplate, t.identifier('createTemplate')),
            t.importSpecifier(insert, t.identifier('insert')),
          ], t.stringLiteral('@xely/eclipsa'))
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
        interface Apply {
          path: Path
          expr: t.Expression
        }
        interface ElemResult {
          text: string
          applies: Apply[]
        }
        const processChildren = (
          children: t.JSXElement['children'],
          path: Path,
        ): ElemResult => {
          let text = ''
          const applies: Apply[] = []
          for (let i = 0; i < children.length; i++) {
            const child = children[i]
            const childPath = [...path, i]
            if (t.isJSXText(child)) {
              text += child.value
            } else if (t.isJSXExpressionContainer(child)) {
              text += `<!-- ${childPath.join(',')} -->`
              applies.push({
                expr: child.expression as t.Expression,
                path: childPath,
              })
            } else if (t.isJSXElement(child)) {
              const processed = processJSXElement(child, childPath)
              text += processed.text
              applies.push(...processed.applies)
            } else if (t.isJSXFragment(child)) {
              const processed = processChildren(child.children, childPath)
              text += processed.text
              applies.push(...processed.applies)
            } else {
              throw new Error(`${child.type} is not supported.`)
            }
          }
          return { text, applies }
        }
        const processJSXElement = (
          elem: t.JSXElement,
          path: Path,
        ): ElemResult => {
          const jsxTypeName = getJSXType(elem.openingElement).name
          const processed = processChildren(elem.children, path)
          const text = `<${jsxTypeName}>${processed.text}</${jsxTypeName}>`
          return { text, applies: processed.applies }
        }
        const { text: tmplHTML, applies } = processJSXElement(path.node, [])
        const tmplID = path.scope.generateUidIdentifier('template')
        templates.push({
          id: tmplID,
          tmpl: tmplHTML,
        })

        const clonedID = path.scope.generateUidIdentifier('cloned')
        const varDecolation = t.variableDeclaration('var', [
          t.variableDeclarator(clonedID, t.callExpression(tmplID, [])),
        ])

        const insertDecolations = applies.map((apply) => {
          let marker: t.Expression = clonedID
          let parent: t.Expression = clonedID
          for (let i = 0; i < apply.path.length; i++) {
            const path = apply.path[i]
            marker = t.memberExpression(
              t.memberExpression(marker, t.identifier('children')),
              t.numericLiteral(path),
              true
            )
            if (i + 2 === apply.path.length && apply.path.length > 1) {
              parent = marker        
            }
          }
          return t.expressionStatement(t.callExpression(insert, [
            apply.expr,
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
