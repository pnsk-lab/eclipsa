import { component$, onCleanup, onMount } from 'eclipsa'

export default component$(() => {
  const value = 'mounted'

  onMount(() => {
    console.log(value)
    onCleanup(() => {
      console.log(`cleanup:${value}`)
    })
  })

  return <button>{value}</button>
})
