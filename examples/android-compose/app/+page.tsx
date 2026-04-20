import { useSignal } from 'eclipsa'
import { Button, Column, Switch, Text, TextField } from '@eclipsa/native-compose'

export default function Page() {
  const count = useSignal(0)
  const enabled = useSignal(true)
  const name = useSignal('Compose')

  return (
    <Column spacing={16}>
      <Text value="Eclipsa Native Android Compose Example" />
      <Text value="This is a simple example of how to use Eclipsa Native with Android Compose." />
      <Text
        value={`Hello ${name.value} · ${enabled.value ? 'enabled' : 'disabled'} · count ${count.value}`}
      />
      <Button
        onClick={() => {
          count.value += 2
        }}
        title={`Count ${count.value}`}
      />
      <TextField
        onValueChange={(value: string) => {
          name.value = String(value ?? '')
        }}
        placeholder="Name"
        value={name.value}
      />
      <Switch
        onCheckedChange={(value: boolean) => {
          enabled.value = Boolean(value)
        }}
        title="Enabled"
        value={enabled.value}
      />
    </Column>
  )
}
