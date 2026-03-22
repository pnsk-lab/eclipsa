import { useSignal } from 'eclipsa'
import { Header } from './Header.tsx'

export const metadata = {
  description: 'E2E layout description',
  title: 'E2E App',
}

export default (props: { children?: unknown }) => {
  const layoutCount = useSignal(0)

  return (
    <div>
      <Header />
      <p>Shared layout shell updated</p>
      <button
        type="button"
        onClick={() => {
          layoutCount.value += 1
        }}
      >
        Layout count: {layoutCount.value}
      </button>
      <main>{props.children}</main>
    </div>
  )
}
