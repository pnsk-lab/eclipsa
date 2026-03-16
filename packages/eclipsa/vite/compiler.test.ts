import os from 'node:os'
import path from 'node:path'
import * as fs from 'node:fs/promises'
import { beforeEach, describe, expect, it } from 'vitest'
import { analyzeModule } from '../compiler/mod.ts'
import {
  collectAppSymbols,
  compileModuleForSSR,
  createResumeHmrUpdate,
  loadSymbolModuleForSSR,
  resetCompilerCache,
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

describe('createResumeHmrUpdate', () => {
  beforeEach(() => {
    resetCompilerCache()
  })

  it('keeps stable HMR keys for default and named components', async () => {
    const previous = await analyze(`
      import { component$ } from "eclipsa";
      export const Header = component$(() => <h1>old</h1>);
      export default component$(() => <div>page</div>);
    `)
    const next = await analyze(`
      import { component$ } from "eclipsa";
      export const Header = component$(() => <h1>new</h1>);
      export default component$(() => <div>page</div>);
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
      import { component$, useSignal } from "eclipsa";
      export default component$(() => {
        const count = useSignal(0);
        return <button onClick$={() => { count.value += 1; }}>{count.value}</button>;
      });
    `,
      '/tmp/event-change.tsx',
    )
    const next = await analyze(
      `
      import { component$, useSignal } from "eclipsa";
      export default component$(() => {
        const count = useSignal(0);
        return <button onClick$={() => { count.value += 2; }}>{count.value}</button>;
      });
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
      import { component$, useSignal } from "eclipsa";
      export default component$(() => {
        const count = useSignal(0);
        return <button>{count.value}</button>;
      });
    `,
      '/tmp/component-change.tsx',
    )
    const next = await analyze(
      `
      import { component$, useSignal } from "eclipsa";
      export default component$(() => {
        const count = useSignal(0);
        return <button><span>{count.value}</span></button>;
      });
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

  it('escalates capture changes to owner rerender', async () => {
    const previous = await analyze(
      `
      import { component$, useSignal } from "eclipsa";
      export default component$(() => {
        const count = useSignal(0);
        const label = useSignal("a");
        return <button onClick$={() => { count.value += 1; }}>{label.value}</button>;
      });
    `,
      '/tmp/capture-change.tsx',
    )
    const next = await analyze(
      `
      import { component$, useSignal } from "eclipsa";
      export default component$(() => {
        const count = useSignal(0);
        const label = useSignal("a");
        return <button onClick$={() => { count.value += label.value.length; }}>{label.value}</button>;
      });
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
      import { component$, useSignal, useWatch } from "eclipsa";
      export default component$(() => {
        const count = useSignal(0);
        useWatch(() => { count.value; });
        return <button>{count.value}</button>;
      });
    `,
      '/tmp/watch-change.tsx',
    )
    const next = await analyze(
      `
      import { component$, useSignal, useWatch } from "eclipsa";
      export default component$(() => {
        const count = useSignal(0);
        useWatch(() => { count.value; });
        useWatch(() => { console.log(count.value); });
        return <button>{count.value}</button>;
      });
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
      import { component$, useSignal } from "eclipsa";
      export default component$(() => {
        const count = useSignal(0);
        return <button>{count.value}</button>;
      });
    `,
      '/tmp/new-event.tsx',
    )
    const next = await analyze(
      `
      import { component$, useSignal } from "eclipsa";
      export default component$(() => {
        const count = useSignal(0);
        return <button onClick$={() => { count.value += 1; }}>{count.value}</button>;
      });
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
      import { component$, onVisible } from "eclipsa";
      export default component$(() => {
        const label = "ready";
        onVisible(() => {
          console.log(label);
        });
        return <div>{label}</div>;
      });
    `,
      '/tmp/on-visible.tsx',
    )
    const next = await analyze(
      `
      import { component$, onVisible } from "eclipsa";
      export default component$(() => {
        const label = "ready";
        onVisible(() => {
          console.log(label.toUpperCase());
        });
        return <div>{label}</div>;
      });
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
      import { component$, onVisible } from "eclipsa";
      export default component$(() => {
        onVisible(() => {
          console.log("ready");
        });
        return <div>ready</div>;
      });
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
      import { component$, onVisible } from "eclipsa";
      import { setupLandingScene } from "./landing-scene.ts";
      export default component$(() => {
        onVisible(() => {
          setupLandingScene({ canvas: null });
        });
        return <div>ready</div>;
      });
    `

    await fs.mkdir(appDir, { recursive: true })
    await fs.writeFile(filePath, source)

    try {
      const symbols = await collectAppSymbols(root)
      const lazySymbol = symbols.find((symbol) => symbol.kind === 'lazy')

      expect(lazySymbol?.code).toContain(`import { setupLandingScene } from "./landing-scene.ts";\n`)

      const compiled = await loadSymbolModuleForSSR(
        `/app/+page.tsx?eclipsa-symbol=${lazySymbol?.id}`,
      )

      expect(compiled).toContain('export default')
      expect(compiled).toContain('setupLandingScene')
    } finally {
      await fs.rm(root, { force: true, recursive: true })
    }
  })

  it('falls back to full reload when top-level component membership changes', async () => {
    const previous = await analyze(
      `
      import { component$ } from "eclipsa";
      export default component$(() => <div>ready</div>);
    `,
      '/tmp/full-reload.tsx',
    )
    const next = await analyze(
      `
      import { component$ } from "eclipsa";
      export const Header = component$(() => <h1>new</h1>);
      export default component$(() => <div>ready</div>);
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
})
