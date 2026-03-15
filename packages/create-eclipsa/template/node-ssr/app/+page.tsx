import { component$, useSignal } from 'eclipsa'

export default component$(() => {
  const count = useSignal(0)

  return (
    <main>
      <h1>Hello from Eclipsa</h1>
      <p>The starter is wired for Node SSR and resumable client updates.</p>
      <button
        type="button"
        onClick$={() => {
          count.value += 1
        }}
      >
        Count: {count.value}
      </button>
    </main>
  )
})
