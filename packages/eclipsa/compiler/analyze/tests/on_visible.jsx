import { onVisible } from 'eclipsa'

export default (() => {
  const value = 'visible'

  onVisible(() => {
    console.log(value)
  })

  return <button>{value}</button>
});
