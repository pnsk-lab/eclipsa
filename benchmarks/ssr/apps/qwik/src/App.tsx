/** @jsxImportSource @builder.io/qwik */
import { component$ } from '@builder.io/qwik'
import { createData } from '../../../data'

export const App = component$(() => (
  <div>
    {createData().map((item) => (
      <div key={item.id}>
        <h3>{item.name}</h3>
        <p>{item.value}</p>
      </div>
    ))}
  </div>
))
