import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it } from 'vitest'
import { __eclipsaComponent, __eclipsaLazy, __eclipsaWatch } from './internal.ts'
import { noSerialize } from './no-serialize.ts'
import { useSignal, useWatch } from './signal.ts'
import { renderSSR } from './ssr.ts'
describe('useWatch resume payload', () => {
  it('serializes resumable watch subscriptions without activating the component', () => {
    const App = __eclipsaComponent(
      () => {
        const tracked = useSignal(0)
        const explicit = useSignal('a')
        useWatch(
          __eclipsaWatch(
            'watch-symbol',
            () => {
              void explicit.value
            },
            () => [explicit],
          ),
          [tracked, () => explicit.value],
        )
        return /* @__PURE__ */ jsxDEV('button', { children: tracked.value }, void 0, false, {
          fileName: 'packages/eclipsa/core/watch-resume.test.ts',
          lineNumber: 26,
          columnNumber: 16,
        })
      },
      'component-symbol',
      () => [],
    )
    const { payload } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/watch-resume.test.ts',
        lineNumber: 32,
        columnNumber: 41,
      }),
    )
    const component = payload.components.c0
    const [[watchId, watch]] = Object.entries(payload.watches)
    expect(component.watchCount).toBe(1)
    expect(watchId).toBe('c0:w0')
    expect(watch.symbol).toBe('watch-symbol')
    expect(watch.mode).toBe('explicit')
    expect(new Set(watch.signals)).toEqual(new Set(component.signalIds))
  })
  it('serializes watch scopes that capture API objects with lazy methods', () => {
    const App = __eclipsaComponent(
      () => {
        const controller = useSignal(null)
        const api = {
          set: __eclipsaLazy(
            'api-set-symbol',
            (value) => {
              controller.value?.set(value)
            },
            () => [controller],
          ),
        }
        controller.value = noSerialize({
          set() {},
        })
        useWatch(
          __eclipsaWatch(
            'watch-symbol',
            () => {
              api.set(1)
            },
            () => [api],
          ),
        )
        return /* @__PURE__ */ jsxDEV('button', { children: 'ready' }, void 0, false, {
          fileName: 'packages/eclipsa/core/watch-resume.test.ts',
          lineNumber: 71,
          columnNumber: 16,
        })
      },
      'component-symbol',
      () => [],
    )
    expect(() =>
      renderSSR(
        () =>
          /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
            fileName: 'packages/eclipsa/core/watch-resume.test.ts',
            lineNumber: 78,
            columnNumber: 23,
          }),
        {
          symbols: {
            'api-set-symbol': '/app/api?eclipsa-symbol=api-set-symbol',
            'watch-symbol': '/app/api?eclipsa-symbol=watch-symbol',
          },
        },
      ),
    ).not.toThrow()
  })
})
