import { Link, useLocation, useSignal } from 'eclipsa'
import type { JSX } from 'eclipsa/jsx-runtime'

const RouteLabel = (props: { label: string }) => {
  const count = useSignal(0)
  return (
    <button type="button" onClick={() => count.value++}>
      {props.label}: {count.value}
    </button>
  )
}

export default (props: { children: JSX.Childable }) => {
  const location = useLocation()
  const labels = location.pathname.endsWith('/b')
    ? ['Second heading', 'Extra heading']
    : ['First heading']
  return (
    <div>
      <nav>
        {labels.map((label) => (
          <a key={label} href={'#' + label}>
            {label}
          </a>
        ))}
      </nav>
      <RouteLabel label={location.pathname} />
      <Link href="/route-props/a">Route A</Link>
      <Link href="/route-props/b">Route B</Link>
      {props.children}
    </div>
  )
}
