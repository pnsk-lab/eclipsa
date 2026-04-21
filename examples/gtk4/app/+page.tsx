import { useSignal } from 'eclipsa'

export default function Page() {
  const count = useSignal(0)
  const enabled = useSignal(true)
  const name = useSignal('GTK4')

  return (
    <div padding={16} spacing={12}>
      <span value="Eclipsa Native GTK4 Example" />
      <span value="GTK4 target scaffolding with the shared native runtime." />
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
        onChangeText={(value: string) => {
          name.value = String(value ?? '')
        }}
        placeholder="Name"
        value={name.value}
      />
      <toggle
        onValueChange={(value: boolean) => {
          enabled.value = Boolean(value)
        }}
        title="Enabled"
        value={enabled.value}
      />
    </div>
  )
}
