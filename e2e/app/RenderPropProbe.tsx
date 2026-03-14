import { component$, useSignal } from 'eclipsa'

export const RenderPropProbe = component$((props: { aa?: unknown; children?: unknown }) => {
  const probeCount = useSignal(0)

  return (
    <section>
      <button
        type="button"
        onClick$={() => {
          probeCount.value += 1
        }}
      >
        Probe count: {probeCount.value}
      </button>
      <div>{props.aa}</div>
      <div>{props.children}</div>
      <div>{props.aa}</div>
    </section>
  )
})
