import ts from 'typescript'
import { runRustAnalyzeCompiler } from '../native/mod.ts'

type SymbolKind = 'action' | 'component' | 'event' | 'lazy' | 'loader' | 'watch'

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
  const insertions: number[] = []

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === '__eclipsaComponent'
    ) {
      const lastArgument = node.arguments.at(-1)
      insertions.push(lastArgument ? lastArgument.end : node.expression.end + 1)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  if (insertions.length === 0) {
    return source
  }

  let nextSource = source
  for (const index of [...insertions].sort((left, right) => right - left)) {
    nextSource = nextSource.slice(0, index) + ', { optimizedRoot: true }' + nextSource.slice(index)
  }

  return nextSource
}

export const analyzeModule = async (
  source: string,
  id = 'analyze-input.tsx',
): Promise<AnalyzedModule> => {
  validateSingleReturnComponents(source, id)
  const analyzed = await runRustAnalyzeCompiler(id, source)
  const code = annotateOptimizedRootComponents(analyzed.code, id)
  return {
    actions: new Map(analyzed.actions),
    code,
    hmrManifest: {
      components: new Map(analyzed.hmrManifest.components),
      symbols: new Map(analyzed.hmrManifest.symbols),
    },
    loaders: new Map(analyzed.loaders),
    symbols: new Map(analyzed.symbols),
  }
}
