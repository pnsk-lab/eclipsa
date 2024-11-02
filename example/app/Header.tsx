import { component$ } from '@xely/eclipsa'

export const Header = component$((props: {
  a: number
}) => <div>
  <h1>Todo List{props.a}</h1>
</div>)
