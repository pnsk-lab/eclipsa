import { useSignal } from 'eclipsa'

export const IslandProjectedCounter = (props: { buttonLabel: string; valueTestId: string }) => {
  const count = useSignal(0)

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          count.value += 1
        }}
      >
        {props.buttonLabel}
      </button>
      <span data-testid={props.valueTestId}>{count.value}</span>
    </div>
  )
}
