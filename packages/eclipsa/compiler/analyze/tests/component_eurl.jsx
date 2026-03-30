export default () => {
  const a = 0
  const add = async () => {
    console.log(a)
  }

  return <button onClick={add}>Add</button>
}
