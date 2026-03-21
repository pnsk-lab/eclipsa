import { useSignal, useWatch } from 'eclipsa'

export default (() => {
  const tracked = useSignal(0)
  const dynamic = useSignal('a')
  const explicit = useSignal('b')

  useWatch(() => {
    console.log(dynamic.value)
  })

  useWatch(() => {
    console.log(explicit.value)
  }, [tracked, () => explicit.value])

  return <button>{tracked.value}</button>
});
