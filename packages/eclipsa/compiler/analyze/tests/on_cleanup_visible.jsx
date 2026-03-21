import { onCleanup, onVisible } from 'eclipsa'

export default (() => {
  const value = 'visible'

  onVisible(() => {
    console.log(value)
    onCleanup(() => {
      console.log(`cleanup:${value}`)
    })
  })

  return <button>{value}</button>
});
