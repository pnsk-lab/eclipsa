import { component$, useSignal } from '@xely/eclipsa'

const A = component$(() => {
  return <div>Hello World</div>
})
export default component$(() => {
  const count = useSignal(0)
  return <button onClick$={(evt) => count.value ++}>
    Count: {count.value}
    <div />
    <A />
  </button>
})
