import { describe, expect, it } from 'vitest'

import {
  createComponentBoundaryHtmlComment,
  createComponentBoundaryMarker,
  createComponentBoundaryPair,
  createInsertMarker,
  createKeyedRangeMarker,
  createProjectionSlotMarker,
  createProjectionSlotRangeKey,
  didComponentBoundaryChange,
  didComponentBoundaryPropsChange,
  didComponentBoundarySymbolChange,
  parseComponentBoundaryMarker,
  parseInsertMarker,
  parseKeyedRangeMarker,
  parseProjectionSlotMarker,
  setComponentBoundaryChangeFlags,
} from './markers.ts'

describe('runtime marker helpers', () => {
  it('round-trips component boundary markers and html comments', () => {
    expect(createComponentBoundaryMarker('c0', 'start')).toBe('ec:c:c0:start')
    expect(createComponentBoundaryHtmlComment('c0', 'end')).toBe('<!--ec:c:c0:end-->')
    expect(parseComponentBoundaryMarker('ec:c:c0:start')).toEqual({
      id: 'c0',
      kind: 'start',
    })
  })

  it('round-trips projection slot, keyed range, and insert markers', () => {
    expect(createProjectionSlotRangeKey('c0', 'children/main', 2)).toBe('c0:children%2Fmain:2')
    expect(
      parseProjectionSlotMarker(createProjectionSlotMarker('c0', 'children/main', 2, 'end')),
    ).toEqual({
      componentId: 'c0',
      key: 'c0:children%2Fmain:2',
      kind: 'end',
      name: 'children/main',
      occurrence: 2,
    })
    expect(parseKeyedRangeMarker(createKeyedRangeMarker('a/b', 'start'))).toEqual({
      key: 'a/b',
      kind: 'start',
    })
    expect(parseInsertMarker(createInsertMarker('42'))).toEqual({
      key: '42',
    })
  })

  it('tracks component boundary change flags on the start comment', () => {
    const doc = {
      createComment: (data: string) => ({ data }) as Comment,
    } as Document
    const { start } = createComponentBoundaryPair(doc, 'c1', {
      propsChanged: true,
      symbolChanged: false,
    })

    expect(didComponentBoundaryPropsChange(start)).toBe(true)
    expect(didComponentBoundarySymbolChange(start)).toBe(false)
    expect(didComponentBoundaryChange(start)).toBe(true)

    setComponentBoundaryChangeFlags(start, {
      propsChanged: false,
      symbolChanged: true,
    })

    expect(didComponentBoundaryPropsChange(start)).toBe(false)
    expect(didComponentBoundarySymbolChange(start)).toBe(true)
    expect(didComponentBoundaryChange(start)).toBe(true)
  })
})
