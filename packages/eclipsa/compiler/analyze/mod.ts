import ts from 'typescript'
import { runRustAnalyzeCompiler } from '@eclipsa/optimizer'

type SymbolKind = 'action' | 'component' | 'event' | 'lazy' | 'loader' | 'realtime' | 'watch'
export type AnalyzeEventMode = 'resumable' | 'direct'

export interface ResumeSymbol {
  captures: string[]
  code: string
  filePath: string
  id: string
  kind: SymbolKind
}

export interface ResumeHmrSymbolEntry {
  captures: string[]
  hmrKey: string
  id: string
  kind: SymbolKind
  ownerComponentKey: string | null
  signature: string
}

export interface ResumeHmrComponentEntry {
  captures: string[]
  hmrKey: string
  id: string
  localSymbolKeys: string[]
  signature: string
}

export interface ResumeHmrManifest {
  components: Map<string, ResumeHmrComponentEntry>
  symbols: Map<string, ResumeHmrSymbolEntry>
}

export interface AnalyzedModule {
  actions: Map<string, { filePath: string; id: string }>
  code: string
  hmrManifest: ResumeHmrManifest
  loaders: Map<string, { filePath: string; id: string }>
  realtimes: Map<string, { filePath: string; id: string }>
  symbols: Map<string, ResumeSymbol>
}

const isPascalCase = (name: string) =>
  name.includes('.') ||
  (name.length > 0 && (!/[a-z]/.test(name[0]!) || name[0] !== name[0]!.toLowerCase()))

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let current = expression
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)) {
    current = current.expression
  }
  return current
}

const getFunctionLikeComponent = (
  node: ts.Node,
): ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration | null => {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
    return node
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
    return getFunctionLikeComponent(node.expression)
  }
  return null
}

const containsEarlyReturn = (node: ts.Node) => {
  let found = false

  const visit = (current: ts.Node) => {
    if (found) {
      return
    }
    if (
      current !== node &&
      (ts.isArrowFunction(current) ||
        ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isGetAccessorDeclaration(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isSetAccessorDeclaration(current))
    ) {
      return
    }
    if (ts.isReturnStatement(current)) {
      found = true
      return
    }
    ts.forEachChild(current, visit)
  }

  ts.forEachChild(node, visit)
  return found
}

const validateSingleReturnComponent = (
  fn: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration,
  label: string,
) => {
  const body = fn.body
  if (!body || !ts.isBlock(body)) {
    return
  }

  const statements = body.statements
  const lastStatement = statements.at(-1)
  if (!lastStatement || !ts.isReturnStatement(lastStatement)) {
    throw new Error(
      `Component "${label}" must end with a single final return statement. Early returns are not supported.`,
    )
  }

  for (const statement of statements.slice(0, -1)) {
    if (containsEarlyReturn(statement)) {
      throw new Error(
        `Component "${label}" must use a single final return statement. Early returns are not supported.`,
      )
    }
  }
}

const validateSingleReturnComponents = (source: string, id: string) => {
  const sourceFile = ts.createSourceFile(
    id,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  const validateComponentNode = (node: ts.Node, label: string) => {
    const component = getFunctionLikeComponent(node)
    if (component) {
      validateSingleReturnComponent(component, label)
    }
  }

  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      isPascalCase(node.name.text)
    ) {
      if (node.initializer) {
        validateComponentNode(node.initializer, node.name.text)
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name && isPascalCase(node.name.text)) {
      validateSingleReturnComponent(node, node.name.text)
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = unwrapExpression(node.left)
      if (ts.isIdentifier(left) && isPascalCase(left.text)) {
        validateComponentNode(node.right, left.text)
      }
    }

    if (ts.isExportAssignment(node)) {
      validateComponentNode(node.expression, 'default')
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

const annotateOptimizedRootComponents = (source: string, id: string) => {
  const sourceFile = ts.createSourceFile(
    id,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const insertions: Array<{
    code: string
    index: number
  }> = []

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === '__eclipsaComponent'
    ) {
      if (node.arguments.length >= 5) {
        return
      }
      const lastArgument = node.arguments.at(-1)
      insertions.push({
        code:
          node.arguments.length >= 4
            ? ', { optimizedRoot: true }'
            : ', undefined, { optimizedRoot: true }',
        index: lastArgument ? lastArgument.end : node.expression.end + 1,
      })
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  if (insertions.length === 0) {
    return source
  }

  let nextSource = source
  for (const insertion of [...insertions].sort((left, right) => right.index - left.index)) {
    nextSource =
      nextSource.slice(0, insertion.index) + insertion.code + nextSource.slice(insertion.index)
  }

  return nextSource
}

const inlineStaticEventCaptureArrays = (source: string, id: string) => {
  const sourceFile = ts.createSourceFile(
    id,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const replacements: Array<{ end: number; start: number; text: string }> = []
  const declarationRangesByName = new Map<
    string,
    Array<{ initializerEnd?: number; initializerStart?: number; start: number }>
  >()

  const unwrapArrayExpression = (expression: ts.Expression): ts.ArrayLiteralExpression | null => {
    let current = expression
    while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)) {
      current = current.expression
    }
    return ts.isArrayLiteralExpression(current) ? current : null
  }

  const addDeclarationRange = (name: string, node: ts.Node, initializer?: ts.Expression | null) => {
    const ranges = declarationRangesByName.get(name)
    const range = {
      initializerEnd: initializer?.end,
      initializerStart: initializer?.getStart(sourceFile),
      start: node.getStart(sourceFile),
    }
    if (ranges) {
      ranges.push(range)
      return
    }
    declarationRangesByName.set(name, [range])
  }

  const collectDeclarations = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      addDeclarationRange(node.name.text, node.name, node.initializer)
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      addDeclarationRange(node.name.text, node.name)
    } else if (ts.isClassDeclaration(node) && node.name) {
      addDeclarationRange(node.name.text, node.name)
    } else if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      addDeclarationRange(node.name.text, node.name)
    }
    ts.forEachChild(node, collectDeclarations)
  }

  collectDeclarations(sourceFile)

  const hasUnsafeDeclarationCapture = (
    captureArray: ts.ArrayLiteralExpression,
    callStart: number,
  ) =>
    captureArray.elements.some((element) => {
      if (!ts.isIdentifier(element)) {
        return false
      }
      return (
        declarationRangesByName.get(element.text)?.some((range) => {
          if (range.start > callStart) {
            return true
          }
          return (
            range.initializerStart !== undefined &&
            range.initializerEnd !== undefined &&
            range.initializerStart <= callStart &&
            callStart < range.initializerEnd
          )
        }) === true
      )
    })

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === '__eclipsaEvent' &&
      node.arguments.length >= 3
    ) {
      const eventName = node.arguments[0]
      const symbol = node.arguments[1]
      const captures = node.arguments[2]!
      const inlineArray =
        unwrapArrayExpression(captures) ??
        ((ts.isArrowFunction(captures) || ts.isFunctionExpression(captures)) &&
        captures.parameters.length === 0 &&
        !ts.isBlock(captures.body)
          ? unwrapArrayExpression(captures.body)
          : null)
      if (inlineArray) {
        if (hasUnsafeDeclarationCapture(inlineArray, node.getStart(sourceFile))) {
          if (unwrapArrayExpression(captures)) {
            replacements.push({
              end: captures.end,
              start: captures.getStart(sourceFile),
              text: `() => ${captures.getText(sourceFile)}`,
            })
          }
          ts.forEachChild(node, visit)
          return
        }
        const inlineElements = inlineArray.elements.filter(
          (element): element is ts.Expression =>
            !!element && !ts.isOmittedExpression(element) && !ts.isSpreadElement(element),
        )
        if (inlineElements.length === inlineArray.elements.length && inlineElements.length <= 4) {
          replacements.push({
            end: node.end,
            start: node.getStart(sourceFile),
            text: `__eclipsaEvent.__${inlineElements.length}(${[
              eventName?.getText(sourceFile),
              symbol?.getText(sourceFile),
              ...inlineElements.map((element) => element.getText(sourceFile)),
            ].join(', ')})`,
          })
          ts.forEachChild(node, visit)
          return
        }
        replacements.push({
          end: captures.end,
          start: captures.getStart(sourceFile),
          text: inlineArray.getText(sourceFile),
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  if (replacements.length === 0) {
    return source
  }

  let nextSource = source
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    nextSource =
      nextSource.slice(0, replacement.start) + replacement.text + nextSource.slice(replacement.end)
  }

  return nextSource
}

const deferLazyCaptureArrays = (source: string, id: string) => {
  const sourceFile = ts.createSourceFile(
    id,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const replacements: Array<{ end: number; start: number; text: string }> = []

  const unwrapArrayExpression = (expression: ts.Expression): ts.ArrayLiteralExpression | null => {
    let current = expression
    while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)) {
      current = current.expression
    }
    return ts.isArrayLiteralExpression(current) ? current : null
  }

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === '__eclipsaLazy' || node.expression.text === '__eclipsaWatch') &&
      node.arguments.length >= 3
    ) {
      const captures = node.arguments[2]!
      const captureArray = unwrapArrayExpression(captures)
      if (captureArray && captureArray.elements.length > 0) {
        replacements.push({
          end: captures.end,
          start: captures.getStart(sourceFile),
          text: `() => ${captures.getText(sourceFile)}`,
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  if (replacements.length === 0) {
    return source
  }

  let nextSource = source
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    nextSource =
      nextSource.slice(0, replacement.start) + replacement.text + nextSource.slice(replacement.end)
  }
  return nextSource
}

export const analyzeModule = async (
  source: string,
  id = 'analyze-input.tsx',
  options?: {
    eventMode?: AnalyzeEventMode
  },
): Promise<AnalyzedModule> => {
  validateSingleReturnComponents(source, id)
  const analyzed = await runRustAnalyzeCompiler(id, source, options?.eventMode)
  const code = inlineStaticEventCaptureArrays(
    deferLazyCaptureArrays(annotateOptimizedRootComponents(analyzed.code, id), id),
    id,
  )
  const symbols = new Map(
    [...analyzed.symbols].map(([symbolId, symbol]) => {
      const symbolFilePath = symbol.filePath || id
      return [
        symbolId,
        {
          ...symbol,
          code: inlineStaticEventCaptureArrays(
            deferLazyCaptureArrays(symbol.code, symbolFilePath),
            symbolFilePath,
          ),
        },
      ]
    }),
  )
  return {
    actions: new Map(analyzed.actions),
    code,
    hmrManifest: {
      components: new Map(analyzed.hmrManifest.components),
      symbols: new Map(analyzed.hmrManifest.symbols),
    },
    loaders: new Map(analyzed.loaders),
    realtimes: new Map(analyzed.realtimes),
    symbols,
  }
}
