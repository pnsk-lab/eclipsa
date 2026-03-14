import './style.css'
import { component$ } from 'eclipsa'

export default component$((props: { children?: unknown }) => {
  return <div>{props.children}</div>
})
