import { Link, Suspense } from 'eclipsa'
import { SuspenseValue } from './SuspenseValue.tsx'

export default () => {
  return (
    <section>
      <h2>Suspense Playground</h2>
      <p>
        <Link href="/">Back home with Link</Link>
      </p>
      <p>Async computed content should resolve before the route shell is committed.</p>
      <Suspense fallback={<p data-testid="suspense-fallback">loading</p>}>
        <SuspenseValue />
      </Suspense>
    </section>
  )
}
