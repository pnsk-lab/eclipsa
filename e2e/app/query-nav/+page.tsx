import { Link, loader } from 'eclipsa'

const useQuery = loader((c) => ({ value: c.req.query('q') ?? 'one' }))

export default () => {
  const query = useQuery()
  return (
    <section>
      <h1>Query navigation</h1>
      <p data-testid="query-result">{query.data?.value ?? 'loading'}</p>
      <Link href="?q=two">Load second query</Link>
    </section>
  )
}
