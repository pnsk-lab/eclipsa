import { html } from 'hono/html'
import { createData } from '../../../data'

export const App = () => html`
  <div>
    ${createData().map(
      (item) => html`
      <div>
        <h3>${item.name}</h3>
        <p>${item.value}</p>
      </div>
    `,
    )}
  </div>
`
