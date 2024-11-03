import { component$, useSignal } from '@xely/eclipsa'

export default component$(() => {
  const count = useSignal(0)
  return <button onClick$={(evt) => count.value ++}>
    Count: {count.value}
  </button>
})
