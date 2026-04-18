import { useSignal } from 'eclipsa'

export default function Page() {
  const count = useSignal(0)
  const enabled = useSignal(true)
  const name = useSignal('SwiftUI')

  return (
    <div spacing={16}>
      <span value="Eclipsa Native SwiftUI Example" />
      <span
        value={`Hello ${name.value} · ${enabled.value ? 'enabled' : 'disabled'} · count ${count.value}`}
      />
      <button
        onPress={() => {
          count.value += 1
        }}
        title={`Count ${count.value}`}
      />
      <input
        onInput={(value: string) => {
          name.value = String(value ?? '')
        }}
        placeholder="Name"
        value={name.value}
      />
      <toggle
        onToggle={(value: boolean) => {
          enabled.value = Boolean(value)
        }}
        title="Enabled"
        value={enabled.value}
      />
    </div>
  )
}
