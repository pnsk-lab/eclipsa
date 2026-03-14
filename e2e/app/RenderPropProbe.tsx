import { component$ } from 'eclipsa'

export const RenderPropProbe = component$((props: { aa?: unknown; children?: unknown }) => (
  <section>
    <div>{props.aa}</div>
    <div>{props.children}</div>
  </section>
))
