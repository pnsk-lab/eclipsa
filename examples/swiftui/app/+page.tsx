import { useSignal } from 'eclipsa'
import { Button, Text, TextField, Toggle, VStack } from '@eclipsa/native-swiftui'

export default function Page() {
  const count = useSignal(0)
  const enabled = useSignal(true)
  const name = useSignal('SwiftUI')

  return (
    <VStack spacing={16}>
      <Text value="Eclipsa Native SwiftUI Example" />
      <Text
        value={`Hello ${name.value} · ${enabled.value ? 'enabled' : 'disabled'} · count ${count.value}`}
      />
      <Button
        onPress={() => {
          count.value += 1
        }}
        title={`Count ${count.value}`}
      />
      <TextField
        onInput={(value: string) => {
          name.value = String(value ?? '')
        }}
        placeholder="Name"
        value={name.value}
      />
      <Toggle
        onToggle={(value: boolean) => {
          enabled.value = Boolean(value)
        }}
        title="Enabled"
        value={enabled.value}
      />
    </VStack>
  )
}
