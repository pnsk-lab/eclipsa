import { loader } from 'eclipsa'

const useSlug = loader((c) => c.req.param('slug'))

export default () => {
  const slug = useSlug()

  return <h1>{slug.data}</h1>
}
