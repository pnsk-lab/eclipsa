import { component$, useSignal } from '@xely/eclipsa'

export default component$(() => {
  const count = useSignal(0)
  return <button onClick$={() => count.value ++}>
    Count: {count.value}
  </button>
})
