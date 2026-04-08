import { Link } from 'eclipsa'
import { IslandProjectedCounter } from '../IslandProjectedCounter.tsx'
import { ReactCounterIsland } from './ReactCounterIsland.ts'

export const metadata = {
  title: 'React Island | E2E',
}

export default () => {
  return (
    <div>
      <h1>React island</h1>
      <p data-testid="react-ssr-copy">React islands render on the server before resume.</p>
      <ReactCounterIsland label="React count">
        <IslandProjectedCounter
          buttonLabel="Increment projected React child"
          valueTestId="react-projected-value"
        />
      </ReactCounterIsland>
      <p>
        <Link href="/">Back home</Link>
      </p>
    </div>
  )
}
