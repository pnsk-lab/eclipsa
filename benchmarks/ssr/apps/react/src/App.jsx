import { createData } from '../../../data'

export default function App() {
  return (
    <div>
      {createData().map((item) => (
        <div key={item.id}>
          <h3>{item.name}</h3>
          <p>{item.value}</p>
        </div>
      ))}
    </div>
  )
}
