import { Link, useNavigate, useSignal } from 'eclipsa'

export default () => {
  const count = useSignal(0)
  const navigate = useNavigate()

  return (
    <div>
      <p>Counter page</p>
      <p>isNavigating: {String(navigate.isNavigating)}</p>
      <p>
        <Link href="/">Back home with Link</Link>
      </p>
      <button type="button" onClick={() => count.value++}>
        Count: {count.value}
      </button>
      <button
        type="button"
        onClick={() => {
          void navigate('/')
        }}
      >
        Back home with navigate()
      </button>
    </div>
  )
}
