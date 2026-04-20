import { useSignal } from 'eclipsa'

export const RenderPropProbe = (props: { aa?: unknown; children?: unknown }) => {
  const probeCount = useSignal(0)

  return (
    <section>
      <button
        type="button"
        onClick={() => {
          probeCount.value += 1
        }}
      >
        Probe count: {probeCount.value}
      </button>
      <div data-testid="probe-aa-0">{props.aa}</div>
      <div data-testid="probe-children">{props.children}</div>
      <div data-testid="probe-aa-1">{props.aa}</div>
    </section>
  )
}
