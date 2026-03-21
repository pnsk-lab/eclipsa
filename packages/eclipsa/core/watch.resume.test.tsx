import { describe, expect, it } from 'vitest'

import { __eclipsaComponent, __eclipsaWatch } from './internal.ts'
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
              explicit.value
            },
            () => [explicit],
          ),
          [tracked, () => explicit.value],
        )

        return <button>{tracked.value}</button>
      },
      'component-symbol',
      () => [],
    )

    const { payload } = renderSSR(() => <App />)
    const component = payload.components.c0
    const [[watchId, watch]] = Object.entries(payload.watches)

    expect(component.watchCount).toBe(1)
    expect(watchId).toBe('c0:w0')
    expect(watch.symbol).toBe('watch-symbol')
    expect(watch.mode).toBe('explicit')
    expect(new Set(watch.signals)).toEqual(new Set(component.signalIds))
  })
})
