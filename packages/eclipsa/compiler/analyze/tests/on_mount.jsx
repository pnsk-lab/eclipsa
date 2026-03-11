import { component$, onMount } from 'eclipsa'

export default component$(() => {
  const value = 'mounted'

  onMount(() => {
    console.log(value)
  })

  return <button>{value}</button>
})
