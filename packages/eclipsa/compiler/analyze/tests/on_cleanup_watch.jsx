import { component$, onCleanup, useSignal, useWatch } from 'eclipsa'

export default component$(() => {
  const tracked = useSignal(0)

  useWatch(() => {
    console.log(tracked.value)
    onCleanup(() => {
      console.log(`cleanup:${tracked.value}`)
    })
  }, [tracked])

  return <button>{tracked.value}</button>
})
