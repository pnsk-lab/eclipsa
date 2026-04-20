import { useLocation } from 'eclipsa'

export default (props: { children?: unknown }) => {
  const location = useLocation()

  return (
    <div>
      <header data-testid="resume-motion-root-path">{location.pathname}</header>
      {props.children}
    </div>
  )
}
