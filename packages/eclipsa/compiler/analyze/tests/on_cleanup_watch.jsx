import { onCleanup, useSignal, useWatch } from 'eclipsa'

export default () => {
  const tracked = useSignal(0)

  useWatch(() => {
    console.log(tracked.value)
    onCleanup(() => {
      console.log(`cleanup:${tracked.value}`)
    })
  }, [tracked])

  return <button>{tracked.value}</button>
}
