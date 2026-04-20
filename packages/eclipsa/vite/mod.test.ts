import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Plugin } from 'vite'
import { RESUME_HMR_EVENT } from '../core/resume-hmr.ts'
import { primeCompilerCache, resetCompilerCache, resolveResumeHmrUpdate } from './compiler.ts'
import { eclipsa } from './mod.ts'

const getPlugins = (): Plugin[] => {
  const plugin = eclipsa()
  if (!Array.isArray(plugin)) {
    throw new Error('Expected eclipsa() to return a plugin array')
  }
  const results = plugin as Plugin[]
  for (const result of results) {
    const configResolved =
      typeof result.configResolved === 'function'
        ? result.configResolved
        : result.configResolved?.handler
    configResolved?.call(
      {} as any,
      {
        isProduction: false,
        root: '/tmp',
      } as any,
    )
  }
  return results
}

const getHotUpdate = (plugin: Plugin) => {
  const hook = plugin.hotUpdate
  if (typeof hook === 'function') {
    return hook
  }
  return hook?.handler
}

const getTransform = (plugin: Plugin) => {
  const hook = plugin.transform
  if (typeof hook === 'function') {
    return hook
  }
  return hook?.handler
}

const getTransformedCode = (
  result: Awaited<ReturnType<NonNullable<ReturnType<typeof getTransform>>>>,
) => {
  if (!result || typeof result === 'string') {
    return null
  }
  return result.code ?? null
}

describe('vite plugin hotUpdate', () => {
  beforeEach(() => {
    resetCompilerCache()
  })

  it('transforms resumable app-local .ts hook modules in both client and ssr environments', async () => {
    const [plugin] = getPlugins()
    const transform = getTransform(plugin)
    const source = `
      import { useSignal } from "eclipsa";

      export const useCounterApi = () => {
        const count = useSignal(0);
        const increment = () => {
          count.value += 1;
        };

        return {
          increment,
        };
      };
    `

    const clientTransformed = await transform?.call(
      {
        environment: {
          name: 'client',
        },
      } as any,
      source,
      '/tmp/app/use-counter-api.ts',
    )
    const ssrTransformed = await transform?.call(
      {
        environment: {
          name: 'ssr',
        },
      } as any,
      source,
      '/tmp/app/use-counter-api.ts',
    )

    expect(clientTransformed).toBeTruthy()
    expect(ssrTransformed).toBeTruthy()
    expect(clientTransformed).toMatchObject({
      code: expect.stringContaining('__eclipsaLazy'),
    })
    expect(ssrTransformed).toMatchObject({
      code: expect.stringContaining('__eclipsaLazy'),
    })
  })

  it('leaves non-app .ts modules to Vite', async () => {
    const [plugin] = getPlugins()
    const transform = getTransform(plugin)
    const transformed = await transform?.call(
      {
        environment: {
          name: 'ssr',
        },
      } as any,
      'export const value = 1;',
      '/tmp/packages/eclipsa/core/action.ts',
    )

    expect(transformed).toBeUndefined()
  })

  it('routes app-local tsx test modules through plain JSX lowering', async () => {
    const [plugin] = getPlugins()
    const transform = getTransform(plugin)
    const transformed = await transform?.call(
      {
        environment: {
          name: 'ssr',
        },
      } as any,
      'export default () => <div>probe</div>;',
      '/tmp/app/+page.test.tsx',
    )

    expect(transformed).toMatchObject({
      code: expect.stringContaining('from "eclipsa/jsx-dev-runtime"'),
    })
    expect(getTransformedCode(transformed)).not.toContain('from "eclipsa/client"')
  })

  it('routes spec files through plain JSX lowering even when they live under app', async () => {
    const [plugin] = getPlugins()
    const transform = getTransform(plugin)
    const transformed = await transform?.call(
      {
        environment: {
          name: 'client',
        },
      } as any,
      'export default () => <div>probe</div>;',
      '/tmp/app/example.spec.tsx',
    )

    expect(transformed).toMatchObject({
      code: expect.stringContaining('from "eclipsa/jsx-dev-runtime"'),
    })
    expect(getTransformedCode(transformed)).not.toContain('from "eclipsa/client"')
  })

  it('runs as a pre-transform plugin so symbol ids are derived from raw TSX', () => {
    const [plugin] = getPlugins()

    expect(plugin.enforce).toBe('pre')
  })

  it('runs HMR after other plugins so CSS generators can observe original modules', () => {
    const [, hmrPlugin] = getPlugins()

    expect(hmrPlugin.name).toBe('vite-plugin-eclipsa:hmr')
    expect(hmrPlugin.enforce).toBe('post')
  })

  it('emits source-module HMR for non-resumable tsx modules', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
          moduleGraph: {
            getModulesByFile(file: string) {
              expect(file).toBe('/tmp/non-resumable.tsx')
              return new Set([
                {
                  url: '/src/non-resumable.tsx',
                },
              ])
            },
          },
        },
      } as any,
      {
        file: '/tmp/non-resumable.tsx',
        modules: [],
        read: () => 'export const value = <div>plain</div>;',
        server: {},
      } as any,
    )

    expect(result).toEqual([])
    expect(send).toHaveBeenCalledWith('update-client', {
      url: '/src/non-resumable.tsx',
    })
  })

  it('preserves css hot-update modules when handling non-resumable tsx updates', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()
    const tsxModule = {
      id: '/src/non-resumable.tsx',
      type: 'js',
      url: '/src/non-resumable.tsx',
    }
    const cssModule = {
      id: '/src/app/style.css',
      type: 'css',
      url: '/src/app/style.css',
    }

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
          moduleGraph: {
            getModulesByFile() {
              return new Set([tsxModule])
            },
          },
        },
      } as any,
      {
        file: '/tmp/non-resumable.tsx',
        modules: [
          {
            type: 'js',
            url: '/src/non-resumable.tsx',
          },
          cssModule,
        ],
        read: () => 'export const value = <div>plain</div>;',
        server: {},
      } as any,
    )

    expect(result).toEqual([cssModule])
    expect(send).toHaveBeenCalledWith('update-client', {
      url: '/src/non-resumable.tsx',
    })
  })

  it('falls back to the app source url when a non-resumable file is rewritten atomically', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
          moduleGraph: {
            getModulesByFile() {
              return new Set()
            },
          },
        },
      } as any,
      {
        file: '/tmp/app/non-resumable.tsx',
        modules: [],
        read: () => 'export const value = <div>after</div>;',
        server: {},
      } as any,
    )

    expect(result).toEqual([])
    expect(send).toHaveBeenCalledWith('update-client', {
      url: '/app/non-resumable.tsx',
    })
  })

  it('preserves css requests even when Vite classifies the stylesheet module as js', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()
    const cssLikeJsModule = {
      file: '/src/app/style.css',
      id: '/src/app/style.css',
      type: 'js',
      url: '/src/app/style.css',
    }
    const tsxModule = {
      id: '/src/non-resumable.tsx',
      type: 'js',
      url: '/src/non-resumable.tsx',
    }

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
          moduleGraph: {
            getModulesByFile() {
              return new Set([tsxModule])
            },
          },
        },
      } as any,
      {
        file: '/tmp/non-resumable.tsx',
        modules: [
          {
            type: 'js',
            url: '/src/non-resumable.tsx',
          },
          cssLikeJsModule,
        ],
        read: () => 'export const value = <div>plain</div>;',
        server: {},
      } as any,
    )

    expect(result).toEqual([cssLikeJsModule])
    expect(send).toHaveBeenCalledWith('update-client', {
      url: '/src/non-resumable.tsx',
    })
  })

  it('collects css-like modules from the module graph when the changed tsx module has none directly', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()
    const cssLikeJsModule = {
      file: '/src/app/style.css',
      id: '/src/app/style.css',
      type: 'js',
      url: '/src/app/style.css',
    }
    const tsxModule = {
      id: '/src/non-resumable.tsx',
      type: 'js',
      url: '/src/non-resumable.tsx',
    }

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
          moduleGraph: {
            getModulesByFile() {
              return new Set([
                {
                  type: 'js',
                  url: '/src/non-resumable.tsx',
                },
              ])
            },
            idToModuleMap: new Map([
              ['/src/non-resumable.tsx', tsxModule],
              ['/src/app/style.css', cssLikeJsModule],
            ]),
          },
        },
      } as any,
      {
        file: '/tmp/non-resumable.tsx',
        modules: [
          {
            type: 'js',
            url: '/src/non-resumable.tsx',
          },
        ],
        read: () => 'export const value = <div>plain</div>;',
        server: {},
      } as any,
    )

    expect(result).toEqual([cssLikeJsModule])
    expect(send).toHaveBeenCalledWith('update-client', {
      url: '/src/non-resumable.tsx',
    })
  })

  it('emits resumable HMR payloads for resumable tsx modules', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()
    const filePath = '/tmp/resumable-page.tsx'
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

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
        },
      } as any,
      {
        file: filePath,
        modules: [{ url: '/tmp/image-page.tsx' }],
        read: () => nextSource,
        server: {},
      } as any,
    )

    expect(result).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toBe(RESUME_HMR_EVENT)
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      fileUrl: '/resumable-page.tsx',
      fullReload: false,
    })
  })

  it('does not source-sniff route component imports when emitting resumable payloads', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()
    const filePath = '/tmp/image-page.tsx'
    const previousSource = `
      import { Image } from "@eclipsa/image";
      export default () => <main><p>before</p><Image alt="demo" src="/demo.png" /></main>;
    `
    const nextSource = `
      import { Image } from "@eclipsa/image";
      export default () => <main><p>after</p><Image alt="demo" src="/demo.png" /></main>;
    `

    await resolveResumeHmrUpdate({
      filePath,
      root: '/tmp',
      source: previousSource,
    })

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
        },
      } as any,
      {
        file: filePath,
        modules: [],
        read: () => nextSource,
        server: {},
      } as any,
    )

    expect(result).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toBe(RESUME_HMR_EVENT)
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      fileUrl: '/image-page.tsx',
      fullReload: false,
    })
  })

  it('keeps client resumable updates on the environment hot channel even when ws is available', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()
    const wsSend = vi.fn()
    const filePath = '/tmp/client-resumable-page.tsx'
    const previousSource = `
      import { useSignal } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        return <button>{count.value}</button>;
      };
    `
    const nextSource = `
      import { useSignal } from "eclipsa";
      export default () => {
        const count = useSignal(0);
        return <button><span>{count.value}</span></button>;
      };
    `

    await resolveResumeHmrUpdate({
      filePath,
      root: '/tmp',
      source: previousSource,
    })

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
        },
      } as any,
      {
        file: filePath,
        modules: [
          {
            type: 'js',
            url: '/src/client-resumable-page.tsx',
          },
        ],
        read: () => nextSource,
        server: {
          ws: {
            send: wsSend,
          },
        },
      } as any,
    )

    expect(result).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toBe(RESUME_HMR_EVENT)
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      fileUrl: '/client-resumable-page.tsx',
      fullReload: false,
    })
    expect(wsSend).not.toHaveBeenCalled()
  })

  it('defers resumable SSR payloads to the client when a client module graph entry exists', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const filePath = '/tmp/ssr-resumable-page.tsx'
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
    const send = vi.fn()
    const wsSend = vi.fn()

    await resolveResumeHmrUpdate({
      filePath,
      root: '/tmp',
      source: previousSource,
    })

    const ssrResult = await hotUpdate?.call(
      {
        environment: {
          name: 'ssr',
          hot: {
            send,
          },
        },
      } as any,
      {
        file: filePath,
        modules: [
          {
            type: 'js',
            url: '/src/ssr-resumable-page.tsx',
          },
        ],
        read: () => nextSource,
        server: {
          environments: {
            client: {
              moduleGraph: {
                getModulesByFile() {
                  return new Set([
                    {
                      url: '/src/ssr-resumable-page.tsx',
                    },
                  ])
                },
              },
            },
          },
          ws: {
            send: wsSend,
          },
        },
      } as any,
    )

    expect(ssrResult).toEqual([])
    expect(send).not.toHaveBeenCalled()
    expect(wsSend).not.toHaveBeenCalled()

    const clientResult = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
        },
      } as any,
      {
        file: filePath,
        modules: [
          {
            type: 'js',
            url: '/src/ssr-resumable-page.tsx',
          },
        ],
        read: () => nextSource,
        server: {},
      } as any,
    )

    expect(clientResult).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toBe(RESUME_HMR_EVENT)
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      fileUrl: '/ssr-resumable-page.tsx',
      fullReload: false,
    })
  })

  it('emits resumable SSR payloads when the changed file has no client module graph entry', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const filePath = '/tmp/ssr-only-layout.tsx'
    const previousSource = `
      const PageLink = (props: { label: string; href: string }) => {
        return <a href={props.href}>{props.label}</a>;
      };
      export default () => {
        return <nav><PageLink label="Overview" href="/docs" /></nav>;
      };
    `
    const nextSource = `
      const PageLink = (props: { label: string; href: string }) => {
        return <a href={props.href}>{props.label}</a>;
      };
      export default () => {
        return <nav><PageLink label="Overview Changed" href="/docs" /></nav>;
      };
    `
    const send = vi.fn()
    const wsSend = vi.fn()

    await resolveResumeHmrUpdate({
      filePath,
      root: '/tmp',
      source: previousSource,
    })

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'ssr',
          hot: {
            send,
          },
        },
      } as any,
      {
        file: filePath,
        modules: [],
        read: () => nextSource,
        server: {
          environments: {
            client: {
              moduleGraph: {
                getModulesByFile() {
                  return new Set()
                },
              },
            },
          },
          ws: {
            send: wsSend,
          },
        },
      } as any,
    )

    expect(result).toEqual([])
    expect(send).not.toHaveBeenCalled()
    expect(wsSend).toHaveBeenCalledTimes(1)
    expect(wsSend.mock.calls[0]?.[0]).toBe(RESUME_HMR_EVENT)
    expect(wsSend.mock.calls[0]?.[1]).toMatchObject({
      fileUrl: '/ssr-only-layout.tsx',
      fullReload: false,
    })
  })

  it('uses the primed compiler cache to avoid first-edit full reloads for SSR-only route files', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const filePath = '/tmp/primed-ssr-only-layout.tsx'
    const previousSource = `
      const PageLink = (props: { label: string; href: string }) => {
        return <a href={props.href}>{props.label}</a>;
      };
      export default () => {
        return <nav><PageLink label="Overview" href="/docs" /></nav>;
      };
    `
    const nextSource = `
      const PageLink = (props: { label: string; href: string }) => {
        return <a href={props.href}>{props.label}</a>;
      };
      export default () => {
        return <nav><PageLink label="Overview Changed" href="/docs" /></nav>;
      };
    `
    const send = vi.fn()

    await primeCompilerCache(filePath, previousSource)

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'ssr',
          hot: {
            send,
          },
        },
      } as any,
      {
        file: filePath,
        modules: [],
        read: () => nextSource,
        server: {},
      } as any,
    )

    expect(result).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toBe(RESUME_HMR_EVENT)
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      fileUrl: '/primed-ssr-only-layout.tsx',
      fullReload: false,
    })
  })

  it('emits resumable full-reload payloads during SSR hot updates when no client diff is available', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const filePath = '/tmp/ssr-full-reload.tsx'
    const previousSource = `
      export default () => <div>ready</div>;
    `
    const nextSource = `
      export const PageLink = () => <a href="/docs">Docs</a>;
      export default () => <div><PageLink /></div>;
    `
    const send = vi.fn()
    const wsSend = vi.fn()

    await resolveResumeHmrUpdate({
      filePath,
      root: '/tmp',
      source: previousSource,
    })

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'ssr',
          hot: {
            send,
          },
        },
      } as any,
      {
        file: filePath,
        modules: [
          {
            type: 'js',
            url: '/src/ssr-full-reload.tsx',
          },
        ],
        read: () => nextSource,
        server: {
          ws: {
            send: wsSend,
          },
        },
      } as any,
    )

    expect(result).toEqual([])
    expect(send).not.toHaveBeenCalled()
    expect(wsSend).toHaveBeenCalledTimes(1)
    expect(wsSend.mock.calls[0]?.[0]).toBe(RESUME_HMR_EVENT)
    expect(wsSend.mock.calls[0]?.[1]).toMatchObject({
      fileUrl: '/ssr-full-reload.tsx',
      fullReload: true,
    })
  })

  it('uses the first transformed source as the resumable HMR baseline for later client updates', async () => {
    const [transformPlugin, hmrPlugin] = getPlugins()
    const transform = getTransform(transformPlugin)
    const hotUpdate = getHotUpdate(hmrPlugin)
    const send = vi.fn()
    const filePath = '/tmp/first-hmr-diff.tsx'
    const previousSource = `
      export default () => <div>before</div>;
    `
    const nextSource = `
      export default () => <div>after</div>;
    `

    await transform?.call(
      {
        environment: {
          name: 'client',
        },
      } as any,
      previousSource,
      filePath,
    )

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
        },
      } as any,
      {
        file: filePath,
        modules: [
          {
            type: 'js',
            url: '/src/first-hmr-diff.tsx',
          },
        ],
        read: () => nextSource,
        server: {},
      } as any,
    )

    expect(result).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toBe(RESUME_HMR_EVENT)
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      fileUrl: '/first-hmr-diff.tsx',
      fullReload: false,
      rerenderComponentSymbols: expect.any(Array),
    })
    expect(
      Object.keys(
        (send.mock.calls[0][1] as { symbolUrlReplacements: Record<string, string> })
          .symbolUrlReplacements,
      ),
    ).not.toHaveLength(0)
  })

  it('retains resumable full-reload payloads after transform caches the next source', async () => {
    const [transformPlugin, hmrPlugin] = getPlugins()
    const transform = getTransform(transformPlugin)
    const hotUpdate = getHotUpdate(hmrPlugin)
    const send = vi.fn()
    const filePath = '/tmp/full-reload.tsx'
    const previousSource = `
      export default () => <div>ready</div>;
    `
    const nextSource = `
      export const PageLink = () => <a href="/docs">Docs</a>;
      export default () => <div><PageLink /></div>;
    `

    await resolveResumeHmrUpdate({
      filePath,
      root: '/tmp',
      source: previousSource,
    })

    await transform?.call(
      {
        environment: {
          name: 'client',
        },
      } as any,
      nextSource,
      filePath,
    )

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
        },
      } as any,
      {
        file: filePath,
        modules: [
          {
            type: 'js',
            url: '/src/full-reload.tsx',
          },
        ],
        read: () => nextSource,
        server: {},
      } as any,
    )

    expect(result).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toBe(RESUME_HMR_EVENT)
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      fileUrl: '/full-reload.tsx',
      fullReload: true,
    })
  })

  it('preserves css hot-update modules when handling resumable tsx updates', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()
    const filePath = '/tmp/resumable-style.tsx'
    const previousSource = `
            export default () => <div class="bg-red-500">ready</div>;
    `
    const nextSource = `
            export default () => <div class="bg-lime-500">ready</div>;
    `
    const cssModule = {
      id: '/src/app/style.css',
      type: 'css',
      url: '/src/app/style.css',
    }

    await resolveResumeHmrUpdate({
      filePath,
      root: '/tmp',
      source: previousSource,
    })

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
        },
      } as any,
      {
        file: filePath,
        modules: [
          {
            type: 'js',
            url: '/src/resumable-style.tsx',
          },
          cssModule,
        ],
        read: () => nextSource,
        server: {},
      } as any,
    )

    expect(result).toEqual([cssModule])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toBe(RESUME_HMR_EVENT)
  })

  it('leaves non-tsx updates to Vite', async () => {
    const [, plugin] = getPlugins()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()

    const result = await hotUpdate?.call(
      {
        environment: {
          name: 'client',
          hot: {
            send,
          },
        },
      } as any,
      {
        file: '/tmp/example.css',
        modules: [],
        read: () => '',
        server: {},
      } as any,
    )

    expect(result).toBeUndefined()
    expect(send).not.toHaveBeenCalled()
  })
})
