import { expect, test } from 'bun:test'
import { createRows, removeRowById, swapBenchmarkRows, updateEveryTenthRow } from './model.ts'

test('benchmark row helpers preserve js-framework-benchmark semantics', () => {
  const { nextId, rows } = createRows(1000, 1)
  expect(nextId).toBe(1001)
  expect(rows).toHaveLength(1000)
  expect(rows[0]?.id).toBe(1)
  expect(rows[999]?.id).toBe(1000)

  const updatedRows = updateEveryTenthRow(rows)
  expect(updatedRows[0]?.label).toEndWith(' !!!')
  expect(updatedRows[10]?.label).toEndWith(' !!!')
  expect(updatedRows[1]?.label).toBe(rows[1]?.label)

  const swappedRows = swapBenchmarkRows(updatedRows)
  expect(swappedRows[1]?.id).toBe(updatedRows[998]?.id)
  expect(swappedRows[998]?.id).toBe(updatedRows[1]?.id)

  const remainingRows = removeRowById(swappedRows, swappedRows[1]!.id)
  expect(remainingRows).toHaveLength(999)
  expect(remainingRows.some((row) => row.id === swappedRows[1]!.id)).toBe(false)
})
