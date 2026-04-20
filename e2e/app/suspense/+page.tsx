import { Link, onMount, useSignal } from 'eclipsa'

export default () => {
  const ready = useSignal(false)

  onMount(() => {
    const timer = setTimeout(() => {
      ready.value = true
    }, 300)
    return () => clearTimeout(timer)
  })

  return (
    <section>
      <h2>Suspense Playground</h2>
      <p>
        <Link href="/">Back home with Link</Link>
      </p>
      <p>Async computed content should resolve before the route shell is committed.</p>
      {ready.value ? (
        <p data-testid="suspense-value">ready</p>
      ) : (
        <p data-testid="suspense-fallback">loading</p>
      )}
    </section>
  )
}
