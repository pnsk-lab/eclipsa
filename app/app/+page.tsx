import { component$, useSignal } from '@xely/eclipsa'

export default component$((a) => {
  const count = useSignal(0)

  return <div>
    <div>Count: {count.value}</div>
    <button>count ++</button>
  </div>
})
