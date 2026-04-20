import { Link } from 'eclipsa'
import { IslandProjectedCounter } from '../IslandProjectedCounter.tsx'
import { VueCounterIsland } from './VueCounterIsland.ts'

export const metadata = {
  title: 'Vue Island | E2E',
}

export default () => {
  return (
    <div>
      <h1>Vue island</h1>
      <p data-testid="vue-ssr-copy">Vue islands render on the server before resume.</p>
      <VueCounterIsland label="Vue count">
        <IslandProjectedCounter
          buttonLabel="Increment projected Vue child"
          valueTestId="vue-projected-value"
        />
      </VueCounterIsland>
      <p>
        <Link href="/">Back home</Link>
      </p>
    </div>
  )
}
