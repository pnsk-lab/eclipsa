import { component$, useSignal } from '@xely/eclipsa'
import { Header } from './Header.tsx'

export default component$(() => {
  const todos = useSignal([1, 2, 3])
  return <div>
    <Header />
    <ul>
      {todos.value.map((todo) => <li key={todo}>{todo}</li>)}
    </ul>
  </div>
})
