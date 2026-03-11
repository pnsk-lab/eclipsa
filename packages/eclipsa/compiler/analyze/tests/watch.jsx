import { component$, useSignal, watch$ } from 'eclipsa'

export default component$(() => {
  const tracked = useSignal(0)
  const dynamic = useSignal('a')
  const explicit = useSignal('b')

  watch$(() => {
    console.log(dynamic.value)
  })

  watch$(() => {
    console.log(explicit.value)
  }, [tracked, () => explicit.value])

  return <button>{tracked.value}</button>
})
