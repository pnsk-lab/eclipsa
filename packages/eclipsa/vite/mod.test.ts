import { describe, expect, it, vi } from 'vitest'
import type { Plugin } from 'vite'
import { RESUME_HMR_EVENT } from '../core/resume-hmr.ts'
import { resolveResumeHmrUpdate } from './compiler.ts'
import { eclipsa } from './mod.ts'

const getPlugin = (): Plugin => {
  const plugin = eclipsa()
  if (!Array.isArray(plugin)) {
    throw new Error('Expected eclipsa() to return a plugin array')
  }
  const result = plugin[0] as Plugin
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
  return result
}

const getHotUpdate = (plugin: Plugin) => {
  const hook = plugin.hotUpdate
  if (typeof hook === 'function') {
    return hook
  }
  return hook?.handler
}

describe('vite plugin hotUpdate', () => {
  it('emits source-module HMR for non-resumable tsx modules', async () => {
    const plugin = getPlugin()
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
    const plugin = getPlugin()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()
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
              return new Set([
                {
                  type: 'js',
                  url: '/src/non-resumable.tsx',
                },
              ])
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

  it('emits resumable HMR payloads for resumable tsx modules', async () => {
    const plugin = getPlugin()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()
    const filePath = '/tmp/resumable-page.tsx'
    const previousSource = `
      import { component$, useSignal } from "eclipsa";
      export default component$(() => {
        const count = useSignal(0);
        return <button onClick$={() => { count.value += 1; }}>{count.value}</button>;
      });
    `
    const nextSource = `
      import { component$, useSignal } from "eclipsa";
      export default component$(() => {
        const count = useSignal(0);
        return <button onClick$={() => { count.value += 2; }}>{count.value}</button>;
      });
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
      fileUrl: '/resumable-page.tsx',
      fullReload: false,
    })
  })

  it('preserves css hot-update modules when handling resumable tsx updates', async () => {
    const plugin = getPlugin()
    const hotUpdate = getHotUpdate(plugin)
    const send = vi.fn()
    const filePath = '/tmp/resumable-style.tsx'
    const previousSource = `
      import { component$ } from "eclipsa";
      export default component$(() => <div class="bg-red-500">ready</div>);
    `
    const nextSource = `
      import { component$ } from "eclipsa";
      export default component$(() => <div class="bg-lime-500">ready</div>);
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
    const plugin = getPlugin()
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
