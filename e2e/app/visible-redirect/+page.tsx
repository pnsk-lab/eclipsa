import { onVisible, useNavigate } from 'eclipsa'

export default () => {
  const navigate = useNavigate()
  onVisible(() => {
    void navigate('/counter', { replace: true })
  })
  return <p>Opening counter</p>
}
