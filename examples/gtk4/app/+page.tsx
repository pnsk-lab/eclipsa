import { useSignal } from 'eclipsa'

export default function Page() {
  const count = useSignal(0)
  const enabled = useSignal(true)
  const name = useSignal('GTK 4')

  return (
    <div orientation="vertical" spacing={16}>
      <span value="Eclipsa Native GTK 4 Examples」s" />
      <span
        value={`Hello ${name.value} · ${enabled.value ? 'enabled' : 'disabled'} · count ${count.value}`}
      />
      <button
        onClick={() => {
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
