import { onMount } from 'eclipsa'

export default () => {
  const value = 'mounted'

  onMount(() => {
    console.log(value)
  })

  return <button>{value}</button>
}
