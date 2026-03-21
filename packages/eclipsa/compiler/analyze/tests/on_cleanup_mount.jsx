import { onCleanup, onMount } from 'eclipsa'

export default (() => {
  const value = 'mounted'

  onMount(() => {
    console.log(value)
    onCleanup(() => {
      console.log(`cleanup:${value}`)
    })
  })

  return <button>{value}</button>
});
