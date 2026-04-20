export const createData = () => {
  return Array.from({ length: 1000 })
    .fill(0)
    .map((_, i) => ({
      id: i,
      name: `Item ${i}`,
      value: Math.random(),
    }))
}
