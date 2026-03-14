import { component$, For, Link, useNavigate, useSignal, useWatch } from 'eclipsa'

export default component$(() => {
  const todos = useSignal<string[]>(['ToDo1'])
  const inputting = useSignal('')
  const navigate = useNavigate()

  useWatch(() => {
    console.log('todos changed', inputting.value)
  })

  return (
    <div>
      <p>isNavigating: {String(navigate.isNavigating)}</p>
      <p>
        <Link href="/counter">Open counter with Link</Link>
      </p>
      <input
        onInput$={(e: InputEvent) => {
          inputting.value = (e.currentTarget as HTMLInputElement).value
        }}
        value={inputting.value}
      />
      <button
        onClick$={() => {
          todos.value = [...todos.value, inputting.value]
          inputting.value = ''
        }}
      >
        Add
      </button>
      <button
        type="button"
        onClick$={() => {
          void navigate('/counter')
        }}
      >
        Go to counter with navigate()
      </button>
      <ul>
        <For arr={todos.value} fn={(todo, i) => <li key={i}>{todo}</li>} />
      </ul>
      <style>
        
      </style>
    </div>
  )
})
