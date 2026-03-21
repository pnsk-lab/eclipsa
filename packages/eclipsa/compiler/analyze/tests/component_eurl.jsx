import { useSignal, $ } from 'eclipsa'
export default (() => {
  const a = 0
  const add = $(() => {
    console.log(a)
  })

  return <button onClick$={() => add()}>Add</button>
});
