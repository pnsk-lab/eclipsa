import { component$, useSignal, $ } from '@xely/eclipsa'
export default component$(() => {
  const a = 0
  const add = $(() => {
    console.log(a)
  })

  return <button onClick$={() => add()}>
    Add
  </button>
})
