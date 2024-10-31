import { component$ } from '@xely/eclipsa'

export const Header = component$<{
  message: string
}>((props) => <div>
  <div>Eclipsaa</div>
  <button onClick$={() => alert(props.message)}>Click me</button>
</div>)
