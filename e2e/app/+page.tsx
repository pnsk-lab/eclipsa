import { For, Link, useNavigate, useSignal, useWatch } from 'eclipsa'
import { ProjectedContent } from './ProjectedContent.tsx'
import { RenderPropProbe } from './RenderPropProbe.tsx'

export const metadata = {
  openGraph: {
    title: 'E2E Home OG',
  },
  title: 'Home | E2E',
}

export default () => {
  const todos = useSignal<string[]>(['ToDo1'])
  const inputting = useSignal('')
  const navigate = useNavigate()

  const handleInput = (e: InputEvent) => {
    inputting.value = (e.currentTarget as HTMLInputElement).value
  }

  const addTodo = () => {
    todos.value = [...todos.value, inputting.value]
    inputting.value = ''
  }

  function goToCounter() {
    void navigate('/counter')
  }

  useWatch(() => {
    console.log('todos changed', inputting.value)
  })

  return (
    <div>
      <p>isNavigating: {String(navigate.isNavigating)}</p>
      <p>
        <Link href="/counter">Open counter with Link</Link>
      </p>
      <p>
        <Link href="/guarded">Open guarded route with Link</Link>
      </p>
      <p>
        <Link href="/actions" prefetch={false}>
          Open actions without prefetch
        </Link>
      </p>
      <p>
        <Link href="/image">Open image route</Link>
      </p>
      <input onInput={handleInput} value={inputting.value} />
      <button onClick={addTodo}>Add</button>
      <button type="button" onClick={goToCounter}>
        Go to counter with navigate()
      </button>
      <RenderPropProbe aa={<ProjectedContent label="Prop component content" />}>
        <ProjectedContent label="Children component content" />
      </RenderPropProbe>
      <ul>
        <For arr={todos.value} fn={(todo, i) => <li key={i}>{todo}</li>} />
      </ul>
    </div>
  )
}
