import { Link, useSignal } from 'eclipsa'
import { useAtom } from 'eclipsa/atom'
import { sharedCountAtom, sharedLabelAtom } from './shared.ts'

export const metadata = {
  title: 'Atom | E2E',
}

const AtomCountButton = (props: {
  testId: string
  title: string
}) => {
  const count = useAtom(sharedCountAtom)

  return (
    <button
      data-testid={props.testId}
      type="button"
      onClick={() => {
        count.value += 1
      }}
    >
      {props.title}: {count.value}
    </button>
  )
}

export default () => {
  const count = useAtom(sharedCountAtom)
  const label = useAtom(sharedLabelAtom)
  const localCount = useSignal(0)

  return (
    <section>
      <h2>Atom Playground</h2>
      <p data-testid="atom-summary">Shared atom count: {count.value}</p>
      <p data-testid="atom-label">Shared atom label: {label.value}</p>
      <div>
        <AtomCountButton testId="atom-left" title="Left atom count" />
        <AtomCountButton testId="atom-right" title="Right atom count" />
      </div>
      <button
        data-testid="atom-label-toggle"
        type="button"
        onClick={() => {
          label.value = label.value === 'idle' ? 'updated' : 'idle'
        }}
      >
        Toggle shared label
      </button>
      <button
        data-testid="atom-local"
        type="button"
        onClick={() => {
          localCount.value += 1
        }}
      >
        Local count: {localCount.value}
      </button>
      <p>
        <Link href="/">Back home with Link</Link>
      </p>
    </section>
  )
}
