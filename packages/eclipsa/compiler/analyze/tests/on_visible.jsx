import { component$, onVisible } from 'eclipsa'

export default component$(() => {
  const value = 'visible'

  onVisible(() => {
    console.log(value)
  })

  return <button>{value}</button>
})
