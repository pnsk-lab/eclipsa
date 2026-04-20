import { useSignal } from 'eclipsa'

export const SuspenseValue = () => {
  const value = useSignal.computed(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 300))
    return 'ready'
  })

  return <p data-testid="suspense-value">{value.value}</p>
}
