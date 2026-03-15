import { component$, Link } from 'eclipsa'

export const Header = component$(() => (
  <div>
    <h1>Todo List</h1>
    <nav>
      <Link href="/">Home</Link>
      {' | '}
      <Link href="/counter">Counter</Link>
      {' | '}
      <Link href="/actions">Actions</Link>
      {' | '}
      <Link href="/suspense">Suspense</Link>
    </nav>
  </div>
))
