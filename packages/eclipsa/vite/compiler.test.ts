import os from 'node:os'
import path from 'node:path'
import * as fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { analyzeModule } from '../compiler/mod.ts'
import {
  collectAppActions,
  collectAppLoaders,
  collectAppRealtimes,
  collectAppSymbols,
  createBuildSymbolEntryName,
  createBuildSymbolUrl,
  compileModuleForClient,
  compileModuleForSSR,
  createSymbolRequestId,
  createDevSymbolUrl,
  parseSymbolRequest,
  primeCompilerCache,
  createResumeHmrUpdate,
  inspectResumeHmrUpdate,
  loadSymbolModuleForClient,
  loadSymbolModuleForSSR,
  resetCompilerCache,
  resolveResumeHmrUpdate,
} from './compiler.ts'

const analyze = async (source: string, filePath = '/tmp/example.tsx') => {
  const analyzed = await analyzeModule(source, filePath)
  if (!analyzed) {
    throw new Error('Expected analyzeModule() to return a module')
  }
  return analyzed
}

const getComponentEntries = (source: Awaited<ReturnType<typeof analyze>>) => [
  ...source.hmrManifest.components.values(),
]

const findComponentId = (source: Awaited<ReturnType<typeof analyze>>, prefix?: string) =>
  getComponentEntries(source).find((entry) => (prefix ? entry.hmrKey.startsWith(prefix) : true))?.id

const findSymbolId = (source: Awaited<ReturnType<typeof analyze>>, prefix: string) =>
  [...source.hmrManifest.symbols.values()].find((entry) => entry.hmrKey.startsWith(prefix))?.id

const resolveWorkspacePath = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url))

describe('createResumeHmrUpdate', () => {
  beforeEach(() => {
    resetCompilerCache()
  })

  it('keeps stable HMR keys for default and named components', async () => {
    const previous = await analyze(`
            export const Header = () => <h1>old</h1>;
      export default () => <div>page</div>;
    `)
    const next = await analyze(`
            export const Header = () => <h1>new</h1>;
      export default () => <div>page</div>;
    `)

    const previousKeys = [...previous.hmrManifest.components.keys()]
    const nextKeys = [...next.hmrManifest.components.keys()]

    expect(previousKeys).toEqual(nextKeys)
    expect(previousKeys).toContain('component:Header')
    expect(
      previousKeys.some((key) => key !== 'component:Header' && key.startsWith('component:')),
    ).toBe(true)
  })

  it('treats event body edits as symbol URL replacements without forcing rerender', async () => {
    const previous = await analyze(
      `
      import { useSignal } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        return <button onClick={() => { count.value += 1; }}>{count.value}</button>;
      };
    `,
      '/tmp/event-change.tsx',
    )
    const next = await analyze(
      `
      import { useSignal } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        return <button onClick={() => { count.value += 2; }}>{count.value}</button>;
      };
    `,
      '/tmp/event-change.tsx',
    )

    const update = createResumeHmrUpdate({
      filePath: '/tmp/event-change.tsx',
      next,
      previous,
      root: '/tmp',
    })
    const [componentEntry] = getComponentEntries(previous)
    const componentId = componentEntry?.id
    const eventId = componentEntry
      ? findSymbolId(previous, `${componentEntry.hmrKey}:event:click`)
      : undefined

    expect(update).toBeTruthy()
    expect(update?.fullReload).toBe(false)
    expect(update?.rerenderComponentSymbols).toEqual([])
    expect(update?.rerenderOwnerSymbols).toEqual([])
    expect(componentId).toBeTruthy()
    expect(eventId).toBeTruthy()
    expect(componentId ? update?.symbolUrlReplacements[componentId] : undefined).toMatch(
      /\?eclipsa-symbol=/,
    )
    expect(eventId ? update?.symbolUrlReplacements[eventId] : undefined).toMatch(
      /\?eclipsa-symbol=/,
    )
  })

  it('rerenders the changed component when its JSX changes', async () => {
    const previous = await analyze(
      `
      import { useSignal } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        return <button>{count.value}</button>;
      };
    `,
      '/tmp/component-change.tsx',
    )
    const next = await analyze(
      `
      import { useSignal } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        return <button><span>{count.value}</span></button>;
      };
    `,
      '/tmp/component-change.tsx',
    )

    const update = createResumeHmrUpdate({
      filePath: '/tmp/component-change.tsx',
      next,
      previous,
      root: '/tmp',
    })
    const componentId = findComponentId(previous)

    expect(update?.fullReload).toBe(false)
    expect(update?.rerenderComponentSymbols).toEqual(componentId ? [componentId] : [])
    expect(update?.rerenderOwnerSymbols).toEqual([])
  })

  it('rerenders the owner component when a child prop literal changes', async () => {
    const previous = await analyze(
      `
      const PageLink = (props: { label: string; href: string }) => {
        return <a href={props.href}>{props.label}</a>;
      };
      export default () => {
        return <nav><PageLink label="Overview" href="/docs/getting-started/overview" /></nav>;
      };
    `,
      '/tmp/child-prop-change.tsx',
    )
    const next = await analyze(
      `
      const PageLink = (props: { label: string; href: string }) => {
        return <a href={props.href}>{props.label}</a>;
      };
      export default () => {
        return <nav><PageLink label="Overview Changed" href="/docs/getting-started/overview" /></nav>;
      };
    `,
      '/tmp/child-prop-change.tsx',
    )

    const update = createResumeHmrUpdate({
      filePath: '/tmp/child-prop-change.tsx',
      next,
      previous,
      root: '/tmp',
    })
    const defaultComponentId = findComponentId(previous, 'component:default')

    expect(update?.fullReload).toBe(false)
    expect(update?.rerenderComponentSymbols).toEqual(defaultComponentId ? [defaultComponentId] : [])
    expect(update?.rerenderOwnerSymbols).toEqual([])
    expect(
      defaultComponentId ? update?.symbolUrlReplacements[defaultComponentId] : undefined,
    ).toMatch(/\?eclipsa-symbol=/)
  })

  it('escalates capture changes to owner rerender', async () => {
    const previous = await analyze(
      `
      import { useSignal } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        const label = useSignal("a");
        return <button onClick={() => { count.value += 1; }}>{label.value}</button>;
      };
    `,
      '/tmp/capture-change.tsx',
    )
    const next = await analyze(
      `
      import { useSignal } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        const label = useSignal("a");
        return <button onClick={() => { count.value += label.value.length; }}>{label.value}</button>;
      };
    `,
      '/tmp/capture-change.tsx',
    )

    const update = createResumeHmrUpdate({
      filePath: '/tmp/capture-change.tsx',
      next,
      previous,
      root: '/tmp',
    })
    const componentId = findComponentId(previous)

    expect(update?.fullReload).toBe(false)
    expect(update?.rerenderOwnerSymbols).toEqual(componentId ? [componentId] : [])
  })

  it('marks local symbol graph changes for owner rerender', async () => {
    const previous = await analyze(
      `
      import { useSignal, useWatch } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        useWatch(() => { count.value; });
        return <button>{count.value}</button>;
      };
    `,
      '/tmp/watch-change.tsx',
    )
    const next = await analyze(
      `
      import { useSignal, useWatch } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        useWatch(() => { count.value; });
        useWatch(() => { console.log(count.value); });
        return <button>{count.value}</button>;
      };
    `,
      '/tmp/watch-change.tsx',
    )

    const update = createResumeHmrUpdate({
      filePath: '/tmp/watch-change.tsx',
      next,
      previous,
      root: '/tmp',
    })
    const componentId = findComponentId(previous)

    expect(update?.fullReload).toBe(false)
    expect(update?.rerenderOwnerSymbols).toEqual(componentId ? [componentId] : [])
  })

  it('registers URLs for newly added event symbols while rerendering the owner', async () => {
    const previous = await analyze(
      `
      import { useSignal } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        return <button>{count.value}</button>;
      };
    `,
      '/tmp/new-event.tsx',
    )
    const next = await analyze(
      `
      import { useSignal } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        return <button onClick={() => { count.value += 1; }}>{count.value}</button>;
      };
    `,
      '/tmp/new-event.tsx',
    )

    const update = createResumeHmrUpdate({
      filePath: '/tmp/new-event.tsx',
      next,
      previous,
      root: '/tmp',
    })
    const componentId = findComponentId(previous)
    const [nextComponent] = getComponentEntries(next)
    const nextEventId = nextComponent
      ? findSymbolId(next, `${nextComponent.hmrKey}:event:click`)
      : undefined

    expect(update?.fullReload).toBe(false)
    expect(update?.rerenderOwnerSymbols).toEqual(componentId ? [componentId] : [])
    expect(nextEventId).toBeTruthy()
    expect(nextEventId ? update?.symbolUrlReplacements[nextEventId] : undefined).toMatch(
      /\?eclipsa-symbol=/,
    )
  })

  it('treats onVisible callbacks as lazy symbol URL replacements', async () => {
    const previous = await analyze(
      `
      import { onVisible } from "eclipsa";
      export default () => {
        const label = "ready";
        onVisible(() => {
          console.log(label);
        });
        return <div>{label}</div>;
      };
    `,
      '/tmp/on-visible.tsx',
    )
    const next = await analyze(
      `
      import { onVisible } from "eclipsa";
      export default () => {
        const label = "ready";
        onVisible(() => {
          console.log(label.toUpperCase());
        });
        return <div>{label}</div>;
      };
    `,
      '/tmp/on-visible.tsx',
    )

    const update = createResumeHmrUpdate({
      filePath: '/tmp/on-visible.tsx',
      next,
      previous,
      root: '/tmp',
    })
    const previousSymbolId = [...previous.hmrManifest.symbols.values()].find(
      (entry) => entry.kind === 'lazy',
    )?.id

    expect(update?.fullReload).toBe(false)
    expect(update?.rerenderOwnerSymbols).toEqual([])
    expect(previousSymbolId).toBeTruthy()
    expect(previousSymbolId ? update?.symbolUrlReplacements[previousSymbolId] : undefined).toMatch(
      /\?eclipsa-symbol=/,
    )
  })

  it('keeps app symbol ids stable between absolute app files and /app module transforms', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eclipsa-vite-compiler-'))
    const appDir = path.join(root, 'app')
    const filePath = path.join(appDir, '+page.tsx')
    const source = `
      import { onVisible } from "eclipsa";
      export default () => {
        onVisible(() => {
          console.log("ready");
        });
        return <div>ready</div>;
      };
    `

    await fs.mkdir(appDir, { recursive: true })
    await fs.writeFile(filePath, source)

    try {
      const symbols = await collectAppSymbols(root)
      const lazySymbol = symbols.find((symbol) => symbol.kind === 'lazy')

      expect(lazySymbol?.filePath).toBe('/app/+page.tsx')

      const compiled = await compileModuleForSSR(source, '/app/+page.tsx')

      expect(lazySymbol?.id).toBeTruthy()
      expect(compiled).toContain(`__eclipsaLazy("${lazySymbol?.id}"`)
    } finally {
      await fs.rm(root, { force: true, recursive: true })
    }
  })

  it('loads lazy symbol modules with valid import boundaries', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eclipsa-vite-symbol-'))
    const appDir = path.join(root, 'app')
    const filePath = path.join(appDir, '+page.tsx')
    const source = `
      import { onVisible } from "eclipsa";
      import { setupLandingScene } from "./landing-scene.ts";
      export default () => {
        onVisible(() => {
          setupLandingScene({ canvas: null });
        });
        return <div>ready</div>;
      };
    `

    await fs.mkdir(appDir, { recursive: true })
    await fs.writeFile(filePath, source)

    try {
      const symbols = await collectAppSymbols(root)
      const lazySymbol = symbols.find((symbol) => symbol.kind === 'lazy')

      expect(lazySymbol?.code).toContain(
        `import { setupLandingScene } from "./landing-scene.ts";\n`,
      )

      const compiled = await loadSymbolModuleForSSR(
        `/app/+page.tsx?eclipsa-symbol=${lazySymbol?.id}`,
      )

      expect(compiled).toContain('export default')
      expect(compiled).toContain('setupLandingScene')
    } finally {
      await fs.rm(root, { force: true, recursive: true })
    }
  })

  it('keeps app-local symbol urls rooted at /app for relative import resolution', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eclipsa-vite-symbol-url-'))
    const appDir = path.join(root, 'app')
    const filePath = path.join(appDir, '+page.tsx')

    await fs.mkdir(appDir, { recursive: true })
    await fs.writeFile(
      filePath,
      `
        import { onVisible } from "eclipsa";
        import { setupLandingScene } from "./landing-scene.ts";
        export default () => {
          onVisible(() => {
            setupLandingScene({ canvas: null });
          });
          return <div>ready</div>;
        };
      `,
    )

    try {
      const symbols = await collectAppSymbols(root)
      const lazySymbol = symbols.find((symbol) => symbol.kind === 'lazy')

      expect(lazySymbol?.filePath).toBe('/app/+page.tsx')
      expect(lazySymbol?.id).toBeTruthy()
      expect(
        lazySymbol ? createDevSymbolUrl(root, lazySymbol.filePath, lazySymbol.id) : null,
      ).toMatch(/^\/app\/\+page\.tsx\?eclipsa-symbol=/)
    } finally {
      await fs.rm(root, { force: true, recursive: true })
    }
  })

  it('collects symbols from package-exported modules imported by app files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eclipsa-vite-symbol-package-'))
    const appDir = path.join(root, 'app')
    const packageDir = path.join(root, 'node_modules', 'ui-kit')
    const pagePath = path.join(appDir, '+page.tsx')
    const packageEntryPath = path.join(packageDir, 'mod.ts')
    const packageComponentPath = path.join(packageDir, 'nav.tsx')

    await fs.mkdir(appDir, { recursive: true })
    await fs.mkdir(packageDir, { recursive: true })
    await fs.writeFile(
      path.join(packageDir, 'package.json'),
      JSON.stringify(
        {
          exports: {
            '.': './mod.ts',
          },
          name: 'ui-kit',
          type: 'module',
        },
        null,
        2,
      ),
    )
    await fs.writeFile(packageEntryPath, `export { SharedNav } from './nav.tsx'\n`)
    await fs.writeFile(
      packageComponentPath,
      `
        export const SharedNav = () => <nav>shared nav</nav>;
      `,
    )
    await fs.writeFile(
      pagePath,
      `
        import { SharedNav } from "ui-kit";
        export default () => <SharedNav />;
      `,
    )

    try {
      const symbols = await collectAppSymbols(root)
      const packageSymbols = symbols.filter((symbol) =>
        symbol.filePath.replaceAll('\\', '/').endsWith('/node_modules/ui-kit/nav.tsx'),
      )

      expect(packageSymbols.some((symbol) => symbol.kind === 'component')).toBe(true)
    } finally {
      await fs.rm(root, { force: true, recursive: true })
    }
  })

  it('collects symbols from workspace packages that export managed components through package exports', async () => {
    const symbols = await collectAppSymbols(resolveWorkspacePath('../../../docs'))

    expect(symbols.some((symbol) => symbol.id === '@eclipsa/motion:motion')).toBe(true)
    expect(symbols.some((symbol) => symbol.id === '@eclipsa/motion:AnimatePresence')).toBe(true)
    expect(symbols.some((symbol) => symbol.id === '@eclipsa/motion:LayoutGroup')).toBe(true)
  })

  it('adds a lang query to symbol request ids while keeping symbol parsing stable', () => {
    const requestId = createSymbolRequestId('/app/+page.tsx', 'symbol-123')

    expect(requestId).toBe('/app/+page.tsx?eclipsa-symbol=symbol-123&lang.js')
    expect(parseSymbolRequest(requestId)).toEqual({
      filePath: '/app/+page.tsx',
      symbolId: 'symbol-123',
    })
  })

  it('creates URL-safe build symbol entry names for package symbols', () => {
    expect(createBuildSymbolEntryName('symbol-123')).toBe('symbol__symbol-123')
    expect(createBuildSymbolEntryName('@eclipsa/motion:motion')).toBe(
      'symbol__b64_QGVjbGlwc2EvbW90aW9uOm1vdGlvbg',
    )
    expect(createBuildSymbolUrl('@eclipsa/motion:motion')).toBe(
      '/entries/symbol__b64_QGVjbGlwc2EvbW90aW9uOm1vdGlvbg.js',
    )
  })

  it('loads workspace motion symbol modules through the virtual symbol pipeline', async () => {
    const filePath = resolveWorkspacePath('../../motion/motion.tsx')
    const source = await fs.readFile(filePath, 'utf8')

    await primeCompilerCache(filePath, source)

    const compiled = await loadSymbolModuleForSSR(
      createSymbolRequestId(filePath, '@eclipsa/motion:MotionConfig'),
    )

    expect(compiled).toContain('export default')
    expect(compiled).toContain('jsxDEV')
  })

  it('falls back to full reload when top-level component membership changes', async () => {
    const previous = await analyze(
      `
            export default () => <div>ready</div>;
    `,
      '/tmp/full-reload.tsx',
    )
    const next = await analyze(
      `
            export const Header = () => <h1>new</h1>;
      export default () => <div>ready</div>;
    `,
      '/tmp/full-reload.tsx',
    )

    const update = createResumeHmrUpdate({
      filePath: '/tmp/full-reload.tsx',
      next,
      previous,
      root: '/tmp',
    })

    expect(update).toEqual({
      fileUrl: '/full-reload.tsx',
      fullReload: true,
      rerenderComponentSymbols: [],
      rerenderOwnerSymbols: [],
      symbolUrlReplacements: {},
    })
  })

  it('returns absolute source file paths for collected actions, loaders, and realtime handlers', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eclipsa-vite-entries-'))
    const appDir = path.join(root, 'app')
    const pagePath = path.join(appDir, '+page.tsx')

    try {
      await fs.mkdir(appDir, { recursive: true })
      await fs.writeFile(
        pagePath,
        [
          'import { action, loader } from "eclipsa";',
          'import { realtime } from "eclipsa";',
          'export const usePing = action(async () => ({ ok: true }));',
          'export const useStats = loader(async () => ({ ok: true }));',
          'export const useRoom = realtime(async () => undefined);',
          'export default () => null;',
        ].join('\n'),
      )

      const actions = await collectAppActions(root)
      const loaders = await collectAppLoaders(root)
      const realtimes = await collectAppRealtimes(root)

      expect(actions).toHaveLength(1)
      expect(loaders).toHaveLength(1)
      expect(realtimes).toHaveLength(1)
      expect(actions[0]?.filePath).toBe(pagePath)
      expect(loaders[0]?.filePath).toBe(pagePath)
      expect(realtimes[0]?.filePath).toBe(pagePath)
      expect(actions[0]?.id).toBeTruthy()
      expect(loaders[0]?.id).toBeTruthy()
      expect(realtimes[0]?.id).toBeTruthy()
    } finally {
      await fs.rm(root, { force: true, recursive: true })
    }
  })

  it('keeps plain event handlers static inside reactive For rows through the full client pipeline', async () => {
    const compiled = await compileModuleForClient(
      `
        import { For } from "eclipsa";

        export default () => (
          <For
            arr={rows}
            fn={(row) => {
              const rowId = row.id;
              const label = row.label;
              const handleClick = () => select(rowId);

              return (
                <tr class={selected.value === rowId ? "danger" : ""}>
                  <td>{rowId}</td>
                  <td><a onClick={handleClick}>{label}</a></td>
                </tr>
              );
            }}
            key={(row) => row.id}
          />
        );
      `,
      '/tmp/reactive-for-event.tsx',
    )

    expect(compiled).toContain('_eventStatic.__')
    expect(compiled).toContain('"click"')
    expect(compiled).toContain('"ka2v86"')
    expect(compiled).toContain('rowId')
    expect(compiled).not.toContain('"onClick", () => __eclipsaLazy')
  })

  it('can skip resumable event lowering for direct client-only builds', async () => {
    const source = `
      import { For } from "eclipsa";

      export default () => (
        <For
          arr={rows}
          fn={(row) => {
            const rowId = row.id;
            const label = row.label;
            const handleClick = () => select(rowId);

            return (
              <tr class={selected.value === rowId ? "danger" : ""}>
                <td>{rowId}</td>
                <td><a onClick={handleClick}>{label}</a></td>
              </tr>
            );
          }}
          key={(row) => row.id}
        />
      );
    `

    const direct = await compileModuleForClient(source, '/tmp/reactive-for-event.tsx', {
      eventMode: 'direct',
    })
    const resumable = await compileModuleForClient(source, '/tmp/reactive-for-event.tsx')

    expect(direct).toContain('const handleClick = () => select(rowId);')
    expect(direct).toContain('_listenerStatic(')
    expect(direct).toContain('"click", handleClick')
    expect(direct).not.toContain('_eventStatic(')
    expect(direct).not.toContain('__eclipsaEvent')
    expect(resumable).toContain('_eventStatic.__')
  })

  it('keeps resumable diff updates after an SSR inspection pass', async () => {
    const filePath = '/tmp/ssr-inspect-then-client-resolve.tsx'
    const previousSource = `
      import { useSignal } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        return <button onClick={() => { count.value += 1; }}>{count.value}</button>;
      };
    `
    const nextSource = `
      import { useSignal } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        return <button onClick={() => { count.value += 2; }}>{count.value}</button>;
      };
    `

    await resolveResumeHmrUpdate({
      filePath,
      root: '/tmp',
      source: previousSource,
    })

    const inspected = await inspectResumeHmrUpdate({
      filePath,
      root: '/tmp',
      source: nextSource,
    })
    const resolved = await resolveResumeHmrUpdate({
      filePath,
      root: '/tmp',
      source: nextSource,
    })

    expect(inspected.update).toMatchObject({
      fileUrl: '/ssr-inspect-then-client-resolve.tsx',
      fullReload: false,
    })
    expect(resolved.update).toMatchObject({
      fileUrl: '/ssr-inspect-then-client-resolve.tsx',
      fullReload: false,
    })
  })

  it('loads new symbol modules after an SSR-only HMR inspection of app routes', async () => {
    const previousSource = `
      export default () => <p>before</p>;
    `
    const nextSource = `
      export default () => <p>after</p>;
    `

    await primeCompilerCache('/app/+layout.tsx', previousSource)

    const inspected = await inspectResumeHmrUpdate({
      filePath: '/app/+layout.tsx',
      root: '/tmp',
      source: nextSource,
    })
    const previousSymbolId = inspected.update?.rerenderComponentSymbols[0]
    const nextSymbolUrl = previousSymbolId
      ? inspected.update?.symbolUrlReplacements[previousSymbolId]
      : null
    const nextSymbolId = nextSymbolUrl
      ? new URL(nextSymbolUrl, 'http://localhost').searchParams.get('eclipsa-symbol')
      : null

    expect(nextSymbolId).toBeTruthy()
    await expect(
      loadSymbolModuleForClient(`/app/+layout.tsx?eclipsa-symbol=${nextSymbolId}`),
    ).resolves.toContain('after')
  })
})
