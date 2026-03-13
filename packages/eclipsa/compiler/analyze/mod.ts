import { preprocessTSX } from '../shared/source.ts'
import { xxHash32 } from '../../utils/xxhash32.ts'
import { analyzeImports } from './analyze-import.ts'
import { babel, generate, t, traverse } from './babel.ts'
import type { Binding, NodePath } from './babel.ts'

type FunctionPath = NodePath<t.ArrowFunctionExpression | t.FunctionExpression>
type SymbolKind = 'component' | 'event' | 'lazy' | 'watch'

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
  code: string
  hmrManifest: ResumeHmrManifest
  symbols: Map<string, ResumeSymbol>
}

const INTERNAL_IMPORT = 'eclipsa/internal'
const INTERNAL_HELPERS = new Set([
  '__eclipsaComponent',
  '__eclipsaEvent',
  '__eclipsaLazy',
  '__eclipsaWatch',
  'getSignalMeta',
])

const EVENT_PROP_REGEX = /^on([A-Z].+)\$$/

const createSymbolId = (filePath: string, kind: SymbolKind, node: t.Node) =>
  xxHash32(`${filePath}:${kind}:${generate(node as any).code}`).toString(36)

const createSymbolSignature = (kind: SymbolKind, code: string) =>
  xxHash32(`${kind}:${code}`).toString(36)

const toEventName = (propName: string) => {
  const matched = propName.match(EVENT_PROP_REGEX)
  if (!matched) {
    return null
  }

  const [first, ...rest] = matched[1]
  return `${first.toLowerCase()}${rest.join('')}`
}

const appendUniqueImport = (imports: t.ImportDeclaration[], declaration: t.ImportDeclaration) => {
  const source = declaration.source.value
  const existing = imports.find((candidate) => candidate.source.value === source)
  if (!existing) {
    imports.push(t.cloneNode(declaration, true))
    return
  }

  const existingKeys = new Set(
    existing.specifiers.map((specifier) => {
      if (t.isImportDefaultSpecifier(specifier)) {
        return `default:${specifier.local.name}`
      }
      if (t.isImportNamespaceSpecifier(specifier)) {
        return `ns:${specifier.local.name}`
      }
      return `named:${
        t.isStringLiteral(specifier.imported) ? specifier.imported.value : specifier.imported.name
      }:${specifier.local.name}`
    }),
  )

  for (const specifier of declaration.specifiers) {
    const key = t.isImportDefaultSpecifier(specifier)
      ? `default:${specifier.local.name}`
      : t.isImportNamespaceSpecifier(specifier)
        ? `ns:${specifier.local.name}`
        : `named:${
            t.isStringLiteral(specifier.imported)
              ? specifier.imported.value
              : specifier.imported.name
          }:${specifier.local.name}`

    if (!existingKeys.has(key)) {
      existing.specifiers.push(t.cloneNode(specifier, true))
      existingKeys.add(key)
    }
  }
}

const validateCapturedBinding = (binding: Binding, referencePath: NodePath<t.Identifier>) => {
  if (binding.kind === 'module' || binding.kind === 'param') {
    return
  }

  if (binding.kind === 'let' || binding.kind === 'var') {
    throw referencePath.buildCodeFrameError(
      `Unsupported resumable capture "${binding.identifier.name}". Mutable locals are not resumable.`,
    )
  }

  if (binding.path.isFunctionDeclaration() || binding.path.isClassDeclaration()) {
    throw referencePath.buildCodeFrameError(
      `Unsupported resumable capture "${binding.identifier.name}". Capture a lazy symbol or JSON value instead.`,
    )
  }

  if (binding.path.isVariableDeclarator()) {
    const init = binding.path.get('init')
    if (
      init.isFunctionExpression() ||
      init.isArrowFunctionExpression() ||
      init.isClassExpression()
    ) {
      throw referencePath.buildCodeFrameError(
        `Unsupported resumable capture "${binding.identifier.name}". Functions and classes must not be captured directly.`,
      )
    }
  }
}

const getRootPathForClonedFunction = (fnNode: t.ArrowFunctionExpression | t.FunctionExpression) => {
  const file = t.file(t.program([t.expressionStatement(fnNode)]))
  let rootPath!: FunctionPath

  traverse(file as any, {
    ExpressionStatement(path: any) {
      const expression = path.get('expression')
      if (expression.isArrowFunctionExpression() || expression.isFunctionExpression()) {
        rootPath = expression as FunctionPath
        path.stop()
      }
    },
  })

  return rootPath
}

const ensureScopeParameter = (fnNode: t.ArrowFunctionExpression | t.FunctionExpression) => {
  const scopeIdentifier = t.identifier('__scope')
  fnNode.params.unshift(scopeIdentifier)
  return scopeIdentifier
}

interface ExtractedSymbol {
  captures: string[]
  code: string
  id: string
  kind: SymbolKind
  signature: string
}

interface PrecomputedComponentInfo {
  hmrKey: string
  localSymbolKeys: string[]
}

interface PrecomputedSymbolInfo {
  hmrKey: string
  ownerComponentKey: string | null
}

const createIndexedKey = (base: string, count: number) => (count === 0 ? base : `${base}:${count}`)

const getComponentBindingName = (path: NodePath<t.CallExpression>) => {
  const parent = path.parentPath
  if (!parent) {
    return null
  }
  if (parent.isExportDefaultDeclaration()) {
    return 'default'
  }
  if (parent.isVariableDeclarator()) {
    const idPath = parent.get('id')
    if (idPath.isIdentifier()) {
      return idPath.node.name
    }
  }
  if (parent.isAssignmentExpression()) {
    const leftPath = parent.get('left')
    if (leftPath.isIdentifier()) {
      return leftPath.node.name
    }
  }
  return null
}

const findOwnerComponentInfo = (
  path: NodePath<t.Node>,
  componentInfoByFunction: WeakMap<t.Node, PrecomputedComponentInfo>,
) => {
  let current = path.parentPath
  while (current) {
    if (
      (current.isArrowFunctionExpression() || current.isFunctionExpression()) &&
      componentInfoByFunction.has(current.node)
    ) {
      return componentInfoByFunction.get(current.node) ?? null
    }
    current = current.parentPath
  }
  return null
}

const isDirectlyInsideComponent = (
  path: NodePath<t.Node>,
  componentInfoByFunction: WeakMap<t.Node, PrecomputedComponentInfo>,
) => {
  let current = path.parentPath
  while (current) {
    if (current.isArrowFunctionExpression() || current.isFunctionExpression()) {
      return componentInfoByFunction.has(current.node)
    }
    current = current.parentPath
  }
  return false
}

const buildResumeHmrMetadata = (
  parsed: t.File,
  identifiers: {
    componentIdentifier?: string
    lazyIdentifier?: string
    watchIdentifier?: string
  },
) => {
  const componentInfoByFunction = new WeakMap<t.Node, PrecomputedComponentInfo>()
  const symbolInfoByFunction = new WeakMap<t.Node, PrecomputedSymbolInfo>()
  const componentCounts = new Map<string, number>()
  const ownerSymbolCounts = new Map<string, number>()

  traverse(parsed, {
    CallExpression: {
      enter(path: any) {
        if (!path.get('callee').isIdentifier()) {
          return
        }
        const calleeName = path.node.callee.name

        if (identifiers.componentIdentifier && calleeName === identifiers.componentIdentifier) {
          const argPath = path.get('arguments')[0]
          if (!argPath?.isArrowFunctionExpression() && !argPath?.isFunctionExpression()) {
            return
          }
          const bindingName = getComponentBindingName(path as NodePath<t.CallExpression>)
          const base = bindingName ? `component:${bindingName}` : 'component:slot'
          const count = componentCounts.get(base) ?? 0
          componentCounts.set(base, count + 1)
          componentInfoByFunction.set(argPath.node, {
            hmrKey: createIndexedKey(base, count),
            localSymbolKeys: [],
          })
          return
        }

        const kind =
          identifiers.lazyIdentifier && calleeName === identifiers.lazyIdentifier
            ? 'lazy'
            : identifiers.watchIdentifier && calleeName === identifiers.watchIdentifier
              ? 'watch'
              : null
        if (!kind) {
          return
        }

        const argPath = path.get('arguments')[0]
        if (!argPath?.isArrowFunctionExpression() && !argPath?.isFunctionExpression()) {
          return
        }

        const ownerComponent = findOwnerComponentInfo(
          path as NodePath<t.Node>,
          componentInfoByFunction,
        )
        const ownerKey = ownerComponent?.hmrKey ?? null
        const base = `${ownerKey ?? 'file'}:${kind}:slot`
        const count = ownerSymbolCounts.get(base) ?? 0
        ownerSymbolCounts.set(base, count + 1)
        const hmrKey = createIndexedKey(base, count)
        symbolInfoByFunction.set(argPath.node, {
          hmrKey,
          ownerComponentKey: ownerKey,
        })
        ownerComponent?.localSymbolKeys.push(hmrKey)
      },
    },
    JSXAttribute: {
      enter(path: any) {
        const nameNode = path.node.name
        const attrName = t.isJSXIdentifier(nameNode) ? nameNode.name : nameNode.name.name
        const eventName = toEventName(attrName)
        if (!eventName) {
          return
        }

        const valuePath = path.get('value')
        if (!valuePath.isJSXExpressionContainer()) {
          return
        }

        const expressionPath = valuePath.get('expression')
        if (!expressionPath.isArrowFunctionExpression() && !expressionPath.isFunctionExpression()) {
          return
        }

        const ownerComponent = findOwnerComponentInfo(
          path as NodePath<t.Node>,
          componentInfoByFunction,
        )
        const ownerKey = ownerComponent?.hmrKey ?? null
        const base = `${ownerKey ?? 'file'}:event:${eventName}`
        const count = ownerSymbolCounts.get(base) ?? 0
        ownerSymbolCounts.set(base, count + 1)
        const hmrKey = createIndexedKey(base, count)
        symbolInfoByFunction.set(expressionPath.node, {
          hmrKey,
          ownerComponentKey: ownerKey,
        })
        ownerComponent?.localSymbolKeys.push(hmrKey)
      },
    },
  })

  return {
    componentInfoByFunction,
    symbolInfoByFunction,
  }
}

const getNormalizedSymbolProgramCode = (
  program: t.Program,
  normalizeSymbolId?: (id: string) => string | undefined,
) => {
  if (!normalizeSymbolId) {
    return generate(program as any).code
  }

  const normalizedProgram = t.cloneNode(program, true)
  const normalizedFile = t.file(normalizedProgram)
  traverse(normalizedFile as any, {
    CallExpression(path: any) {
      if (!path.get('callee').isIdentifier()) {
        return
      }
      const calleeName = path.node.callee.name
      const idArgIndex =
        calleeName === '__eclipsaEvent'
          ? 1
          : calleeName === '__eclipsaLazy' || calleeName === '__eclipsaWatch'
            ? 0
            : -1
      if (idArgIndex < 0) {
        return
      }

      const argPath = path.get(`arguments.${idArgIndex}`)
      if (!argPath.isStringLiteral()) {
        return
      }
      const normalizedId = normalizeSymbolId(argPath.node.value)
      if (!normalizedId) {
        return
      }
      argPath.replaceWith(t.stringLiteral(normalizedId))
    },
  })

  return generate(normalizedProgram as any).code
}

const extractSymbol = (
  fnPath: FunctionPath,
  kind: SymbolKind,
  filePath: string,
  options?: {
    normalizeSymbolId?: (id: string) => string | undefined
  },
): ExtractedSymbol => {
  const id = createSymbolId(filePath, kind, fnPath.node)
  const capturedBindings = new Map<string, number>()
  const moduleImports: t.ImportDeclaration[] = []

  fnPath.traverse({
    Identifier(path) {
      if (!path.isReferencedIdentifier()) {
        return
      }

      const binding = path.scope.getBinding(path.node.name)
      if (!binding) {
        return
      }

      if (binding.kind === 'module') {
        const importDeclaration = binding.path.parentPath?.node
        if (importDeclaration && t.isImportDeclaration(importDeclaration)) {
          appendUniqueImport(moduleImports, importDeclaration)
        }
        return
      }

      let reachableScope: typeof binding.scope | undefined = binding.scope
      let reachable = false
      while (reachableScope) {
        if (reachableScope === fnPath.scope) {
          reachable = true
          break
        }
        reachableScope = reachableScope.parent
      }

      if (reachable) {
        return
      }

      validateCapturedBinding(binding, path)
      if (!capturedBindings.has(binding.identifier.name)) {
        capturedBindings.set(binding.identifier.name, capturedBindings.size)
      }
    },
    JSXOpeningElement(path) {
      const namePath = path.get('name')
      if (!namePath.isJSXIdentifier()) {
        return
      }

      const componentName = namePath.node.name
      if (!/^[A-Z]/.test(componentName)) {
        return
      }

      const binding = namePath.scope.getBinding(componentName)
      if (!binding) {
        return
      }

      if (binding.kind === 'module') {
        const importDeclaration = binding.path.parentPath?.node
        if (importDeclaration && t.isImportDeclaration(importDeclaration)) {
          appendUniqueImport(moduleImports, importDeclaration)
        }
        return
      }

      let reachableScope: typeof binding.scope | undefined = binding.scope
      while (reachableScope) {
        if (reachableScope === fnPath.scope) {
          return
        }
        reachableScope = reachableScope.parent
      }

      throw namePath.buildCodeFrameError(
        `Unsupported resumable component reference "${componentName}". Import the component from a module.`,
      )
    },
  })

  const clonedFunction = t.cloneNode(fnPath.node, true)
  const rootPath = getRootPathForClonedFunction(clonedFunction)
  const scopeIdentifier = ensureScopeParameter(clonedFunction)
  const helperImports = new Set<string>()

  rootPath.traverse({
    Identifier(path) {
      if (!path.isReferencedIdentifier()) {
        return
      }

      const identifierName = path.node.name
      if (identifierName === scopeIdentifier.name) {
        return
      }

      if (INTERNAL_HELPERS.has(identifierName)) {
        helperImports.add(identifierName)
      }

      const binding = path.scope.getBinding(identifierName)
      if (binding) {
        let reachableScope: typeof binding.scope | undefined = binding.scope
        let reachable = false
        while (reachableScope) {
          if (reachableScope === rootPath.scope) {
            reachable = true
            break
          }
          reachableScope = reachableScope.parent
        }

        if (reachable) {
          return
        }
      }

      const captureIndex = capturedBindings.get(identifierName)
      if (captureIndex === undefined) {
        return
      }

      path.replaceWith(t.memberExpression(scopeIdentifier, t.numericLiteral(captureIndex), true))
    },
  })

  if (helperImports.size > 0) {
    appendUniqueImport(
      moduleImports,
      t.importDeclaration(
        [...helperImports].map((helperName) =>
          t.importSpecifier(t.identifier(helperName), t.identifier(helperName)),
        ),
        t.stringLiteral(INTERNAL_IMPORT),
      ),
    )
  }

  const symbolProgram = t.program([...moduleImports, t.exportDefaultDeclaration(clonedFunction)])
  const code = generate(symbolProgram as any).code
  const signature = createSymbolSignature(
    kind,
    getNormalizedSymbolProgramCode(symbolProgram, options?.normalizeSymbolId),
  )

  return {
    captures: [...capturedBindings.keys()],
    code,
    id,
    kind,
    signature,
  }
}

const isBindingReachable = (binding: Binding, scope: NodePath<t.Node>['scope']) => {
  let reachableScope: typeof binding.scope | undefined = binding.scope
  while (reachableScope) {
    if (reachableScope === scope) {
      return true
    }
    reachableScope = reachableScope.parent
  }
  return false
}

const collectCapturedBindings = (
  rootPath: NodePath<t.Node>,
  rootScope: NodePath<t.Node>['scope'],
  capturedBindings: Map<string, number>,
  moduleImports: t.ImportDeclaration[],
) => {
  rootPath.traverse({
    Identifier(path) {
      if (!path.isReferencedIdentifier()) {
        return
      }

      const binding = path.scope.getBinding(path.node.name)
      if (!binding) {
        return
      }

      if (binding.kind === 'module') {
        const importDeclaration = binding.path.parentPath?.node
        if (importDeclaration && t.isImportDeclaration(importDeclaration)) {
          appendUniqueImport(moduleImports, importDeclaration)
        }
        return
      }

      if (isBindingReachable(binding, rootScope)) {
        return
      }

      validateCapturedBinding(binding, path)
      if (!capturedBindings.has(binding.identifier.name)) {
        capturedBindings.set(binding.identifier.name, capturedBindings.size)
      }
    },
    JSXOpeningElement(path) {
      const namePath = path.get('name')
      if (!namePath.isJSXIdentifier()) {
        return
      }

      const componentName = namePath.node.name
      if (!/^[A-Z]/.test(componentName)) {
        return
      }

      const binding = namePath.scope.getBinding(componentName)
      if (!binding) {
        return
      }

      if (binding.kind === 'module') {
        const importDeclaration = binding.path.parentPath?.node
        if (importDeclaration && t.isImportDeclaration(importDeclaration)) {
          appendUniqueImport(moduleImports, importDeclaration)
        }
        return
      }

      if (isBindingReachable(binding, rootScope)) {
        return
      }

      throw namePath.buildCodeFrameError(
        `Unsupported resumable component reference "${componentName}". Import the component from a module.`,
      )
    },
  })
}

const toBlockStatement = (body: t.BlockStatement | t.Expression) =>
  t.isBlockStatement(body)
    ? t.cloneNode(body, true)
    : t.blockStatement([t.returnStatement(t.cloneNode(body, true))])

const extractWatchSymbol = (
  fnPath: FunctionPath,
  dependenciesPath: NodePath<t.Node> | undefined,
  filePath: string,
): ExtractedSymbol => {
  const capturedBindings = new Map<string, number>()
  const moduleImports: t.ImportDeclaration[] = []

  collectCapturedBindings(fnPath as NodePath<t.Node>, fnPath.scope, capturedBindings, moduleImports)
  if (dependenciesPath) {
    collectCapturedBindings(dependenciesPath, fnPath.scope, capturedBindings, moduleImports)
  }

  const phaseIdentifier = t.identifier('__phase')
  const trackBody = dependenciesPath
    ? [
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('__dependencies'),
            t.cloneNode(dependenciesPath.node as t.Expression, true),
          ),
        ]),
        t.forOfStatement(
          t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__dependency'))]),
          t.identifier('__dependencies'),
          t.blockStatement([
            t.ifStatement(
              t.binaryExpression(
                '===',
                t.unaryExpression('typeof', t.identifier('__dependency')),
                t.stringLiteral('function'),
              ),
              t.blockStatement([
                t.expressionStatement(t.callExpression(t.identifier('__dependency'), [])),
                t.continueStatement(),
              ]),
            ),
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier('__signalMeta'),
                t.callExpression(t.identifier('getSignalMeta'), [t.identifier('__dependency')]),
              ),
            ]),
            t.ifStatement(
              t.unaryExpression('!', t.identifier('__signalMeta')),
              t.blockStatement([
                t.throwStatement(
                  t.newExpression(t.identifier('TypeError'), [
                    t.stringLiteral('useWatch dependencies must be signals or getter functions.'),
                  ]),
                ),
              ]),
            ),
            t.expressionStatement(
              t.memberExpression(t.identifier('__dependency'), t.identifier('value')),
            ),
          ]),
        ),
        t.returnStatement(),
      ]
    : [t.returnStatement()]

  const watchFunction = t.arrowFunctionExpression(
    [phaseIdentifier],
    t.blockStatement([
      t.ifStatement(
        t.binaryExpression('===', t.cloneNode(phaseIdentifier), t.stringLiteral('track')),
        t.blockStatement(trackBody),
      ),
      ...toBlockStatement(fnPath.node.body).body,
    ]),
  )
  const id = createSymbolId(filePath, 'watch', watchFunction)
  const clonedFunction = t.cloneNode(watchFunction, true)
  const rootPath = getRootPathForClonedFunction(clonedFunction)
  const scopeIdentifier = ensureScopeParameter(clonedFunction)
  const helperImports = new Set<string>()

  rootPath.traverse({
    Identifier(path) {
      if (!path.isReferencedIdentifier()) {
        return
      }

      const identifierName = path.node.name
      if (identifierName === scopeIdentifier.name) {
        return
      }

      if (INTERNAL_HELPERS.has(identifierName)) {
        helperImports.add(identifierName)
      }

      const binding = path.scope.getBinding(identifierName)
      if (binding && isBindingReachable(binding, rootPath.scope)) {
        return
      }

      const captureIndex = capturedBindings.get(identifierName)
      if (captureIndex === undefined) {
        return
      }

      path.replaceWith(t.memberExpression(scopeIdentifier, t.numericLiteral(captureIndex), true))
    },
  })

  if (helperImports.size > 0) {
    appendUniqueImport(
      moduleImports,
      t.importDeclaration(
        [...helperImports].map((helperName) =>
          t.importSpecifier(t.identifier(helperName), t.identifier(helperName)),
        ),
        t.stringLiteral(INTERNAL_IMPORT),
      ),
    )
  }

  const symbolProgram = t.program([...moduleImports, t.exportDefaultDeclaration(clonedFunction)])
  const code = generate(symbolProgram as any).code

  return {
    captures: [...capturedBindings.keys()],
    code,
    id,
    kind: 'watch',
    signature: createSymbolSignature('watch', code),
  }
}

const buildCaptureGetter = (captures: string[]) =>
  t.arrowFunctionExpression([], t.arrayExpression(captures.map((name) => t.identifier(name))))

export const analyzeModule = async (
  source: string,
  id = 'analyze-input.tsx',
): Promise<AnalyzedModule | null> => {
  const preprocessed = await preprocessTSX(source, id)
  const parsed = babel.parse(preprocessed.code, {
    babelrc: false,
    configFile: false,
    parserOpts: {
      plugins: ['jsx'],
      sourceType: 'module',
    },
    sourceType: 'module',
  })

  if (!parsed) {
    return null
  }

  const imports = analyzeImports(parsed)
  const eclipsaImports = imports.get('eclipsa')
  const componentIdentifier = eclipsaImports?.get('component$')
  const lazyIdentifier = eclipsaImports?.get('$')
  const signalIdentifier = eclipsaImports?.get('useSignal')
  const watchIdentifier = eclipsaImports?.get('useWatch')
  const hmrMetadata = buildResumeHmrMetadata(parsed, {
    componentIdentifier,
    lazyIdentifier,
    watchIdentifier,
  })

  const builtSymbols = new Map<string, ResumeSymbol>()
  const hmrComponents = new Map<string, ResumeHmrComponentEntry>()
  const hmrSymbols = new Map<string, ResumeHmrSymbolEntry>()
  const hmrKeyBySymbolId = new Map<string, string>()
  const usedHelpers = new Set<string>()
  let programPath!: NodePath<t.Program>

  traverse(parsed, {
    Program: {
      enter(path: any) {
        programPath = path as NodePath<t.Program>
      },
      exit(path: any) {
        if (usedHelpers.size === 0) {
          return
        }
        path.unshiftContainer(
          'body',
          t.importDeclaration(
            [...usedHelpers]
              .sort()
              .map((helperName) =>
                t.importSpecifier(t.identifier(helperName), t.identifier(helperName)),
              ),
            t.stringLiteral(INTERNAL_IMPORT),
          ),
        )
      },
    },
    JSXAttribute: {
      exit(path: any) {
        const nameNode = path.node.name
        const attrName = t.isJSXIdentifier(nameNode) ? nameNode.name : nameNode.name.name
        const eventName = toEventName(attrName)
        if (!eventName) {
          return
        }

        const valuePath = path.get('value')
        if (!valuePath.isJSXExpressionContainer()) {
          return
        }

        const expressionPath = valuePath.get('expression')
        if (!expressionPath.isArrowFunctionExpression() && !expressionPath.isFunctionExpression()) {
          return
        }

        const extracted = extractSymbol(expressionPath as FunctionPath, 'event', id)
        const symbolInfo = hmrMetadata.symbolInfoByFunction.get(expressionPath.node)
        builtSymbols.set(extracted.id, {
          captures: extracted.captures,
          code: extracted.code,
          filePath: id,
          id: extracted.id,
          kind: extracted.kind,
        })
        const hmrKey = symbolInfo?.hmrKey ?? `file:event:${extracted.id}`
        hmrSymbols.set(hmrKey, {
          captures: extracted.captures,
          hmrKey,
          id: extracted.id,
          kind: extracted.kind,
          ownerComponentKey: symbolInfo?.ownerComponentKey ?? null,
          signature: extracted.signature,
        })
        hmrKeyBySymbolId.set(extracted.id, hmrKey)
        usedHelpers.add('__eclipsaEvent')

        valuePath.replaceWith(
          t.jsxExpressionContainer(
            t.callExpression(t.identifier('__eclipsaEvent'), [
              t.stringLiteral(eventName),
              t.stringLiteral(extracted.id),
              buildCaptureGetter(extracted.captures),
            ]),
          ),
        )
      },
    },
    CallExpression: {
      exit(path: any) {
        if (!path.get('callee').isIdentifier()) {
          return
        }

        const calleeName = path.node.callee.name
        if (signalIdentifier && calleeName === signalIdentifier) {
          if (!isDirectlyInsideComponent(path as NodePath<t.Node>, hmrMetadata.componentInfoByFunction)) {
            throw path.buildCodeFrameError(
              'useSignal() can only be used while rendering a component$ and must be called at the top level of the component$ body (not inside nested functions).',
            )
          }
          return
        }

        if (lazyIdentifier && calleeName === lazyIdentifier) {
          const argPath = path.get('arguments')[0]
          if (!argPath?.isArrowFunctionExpression() && !argPath?.isFunctionExpression()) {
            throw path.buildCodeFrameError('$() expects a function expression.')
          }

          const extracted = extractSymbol(argPath as FunctionPath, 'lazy', id)
          const symbolInfo = hmrMetadata.symbolInfoByFunction.get(argPath.node)
          builtSymbols.set(extracted.id, {
            captures: extracted.captures,
            code: extracted.code,
            filePath: id,
            id: extracted.id,
            kind: extracted.kind,
          })
          const hmrKey = symbolInfo?.hmrKey ?? `file:lazy:${extracted.id}`
          hmrSymbols.set(hmrKey, {
            captures: extracted.captures,
            hmrKey,
            id: extracted.id,
            kind: extracted.kind,
            ownerComponentKey: symbolInfo?.ownerComponentKey ?? null,
            signature: extracted.signature,
          })
          hmrKeyBySymbolId.set(extracted.id, hmrKey)
          usedHelpers.add('__eclipsaLazy')

          path.replaceWith(
            t.callExpression(t.identifier('__eclipsaLazy'), [
              t.stringLiteral(extracted.id),
              t.cloneNode(argPath.node, true),
              buildCaptureGetter(extracted.captures),
            ]),
          )
          return
        }

        if (watchIdentifier && calleeName === watchIdentifier) {
          const argPath = path.get('arguments')[0]
          if (!argPath?.isArrowFunctionExpression() && !argPath?.isFunctionExpression()) {
            throw path.buildCodeFrameError(
              'useWatch() expects a function expression as the first argument.',
            )
          }

          const dependenciesPath = path.get('arguments')[1]
          const extracted = extractWatchSymbol(
            argPath as FunctionPath,
            dependenciesPath && !Array.isArray(dependenciesPath)
              ? (dependenciesPath as NodePath<t.Node>)
              : undefined,
            id,
          )
          const symbolInfo = hmrMetadata.symbolInfoByFunction.get(argPath.node)
          builtSymbols.set(extracted.id, {
            captures: extracted.captures,
            code: extracted.code,
            filePath: id,
            id: extracted.id,
            kind: extracted.kind,
          })
          const hmrKey = symbolInfo?.hmrKey ?? `file:watch:${extracted.id}`
          hmrSymbols.set(hmrKey, {
            captures: extracted.captures,
            hmrKey,
            id: extracted.id,
            kind: extracted.kind,
            ownerComponentKey: symbolInfo?.ownerComponentKey ?? null,
            signature: extracted.signature,
          })
          hmrKeyBySymbolId.set(extracted.id, hmrKey)
          usedHelpers.add('__eclipsaWatch')

          path.node.arguments[0] = t.callExpression(t.identifier('__eclipsaWatch'), [
            t.stringLiteral(extracted.id),
            t.cloneNode(argPath.node, true),
            buildCaptureGetter(extracted.captures),
          ])
          return
        }

        if (componentIdentifier && calleeName === componentIdentifier) {
          const argPath = path.get('arguments')[0]
          if (!argPath?.isArrowFunctionExpression() && !argPath?.isFunctionExpression()) {
            throw path.buildCodeFrameError('component$() expects a function expression.')
          }

          const extracted = extractSymbol(argPath as FunctionPath, 'component', id, {
            normalizeSymbolId(symbolId) {
              return hmrKeyBySymbolId.get(symbolId)
            },
          })
          const componentInfo = hmrMetadata.componentInfoByFunction.get(argPath.node)
          builtSymbols.set(extracted.id, {
            captures: extracted.captures,
            code: extracted.code,
            filePath: id,
            id: extracted.id,
            kind: extracted.kind,
          })
          const hmrKey = componentInfo?.hmrKey ?? `component:${extracted.id}`
          hmrSymbols.set(hmrKey, {
            captures: extracted.captures,
            hmrKey,
            id: extracted.id,
            kind: extracted.kind,
            ownerComponentKey: null,
            signature: extracted.signature,
          })
          hmrComponents.set(hmrKey, {
            captures: extracted.captures,
            hmrKey,
            id: extracted.id,
            localSymbolKeys: [...(componentInfo?.localSymbolKeys ?? [])],
            signature: extracted.signature,
          })
          hmrKeyBySymbolId.set(extracted.id, hmrKey)
          usedHelpers.add('__eclipsaComponent')

          path.node.arguments[0] = t.callExpression(t.identifier('__eclipsaComponent'), [
            t.cloneNode(argPath.node, true),
            t.stringLiteral(extracted.id),
            buildCaptureGetter(extracted.captures),
          ])
        }
      },
    },
  })

  return {
    code: generate(programPath.node as any).code,
    hmrManifest: {
      components: hmrComponents,
      symbols: hmrSymbols,
    },
    symbols: builtSymbols,
  }
}
