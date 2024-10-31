import { component$, useSignal } from '@xely/eclipsa'
import { Header } from './Header.tsx'

export default component$(() => {
  const todos = useSignal<string[]>([])

  const inputting = useSignal('')
  return <div>
    <Header />
    <input onInput$={(e: InputEvent) => {
      inputting.value = (e.currentTarget as HTMLInputElement).value
    }} value={inputting.value} />
    <button onClick$={() => {
      todos.value = [...todos.value, inputting.value]
      inputting.value = ''
    }}>Add</button>
    <ul>
      {todos.value.map((todo, i) => <li key={i}>{todo}</li>)}
    </ul>
  </div>
})
