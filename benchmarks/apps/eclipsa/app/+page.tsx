import { createData } from '../../../data'

export default () => {
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
