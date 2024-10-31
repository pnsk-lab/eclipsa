import { component$, useSignal } from '@xely/eclipsa'
import { Header } from './Header.tsx'

export default component$(() => {
  const count = useSignal(0)

  return <div>
    <Header message='Clicked!' />
    <div>Count:{count.value}</div>
    <button type="button" onClick$={() => {
      count.value ++
    }}>count ++</button>
  </div>
})
