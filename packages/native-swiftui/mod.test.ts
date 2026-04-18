import { createElement } from '@eclipsa/native-core'
import { resolveNativeElementType } from '@eclipsa/native'
import { SWIFTUI_DEFAULT_TAG_MAP, Text, VStack } from './mod.ts'
import { describe, expect, it } from 'vitest'

describe('@eclipsa/native-swiftui', () => {
  it('exports the default SwiftUI tag map', () => {
    expect(SWIFTUI_DEFAULT_TAG_MAP.windowGroup).toBe('swiftui:window-group')
    expect(SWIFTUI_DEFAULT_TAG_MAP.vstack).toBe('swiftui:vstack')
  })

  it('wraps primitives as native elements using the SwiftUI tags', () => {
    const element = createElement(resolveNativeElementType(VStack), {
      children: createElement(resolveNativeElementType(Text), { value: 'Hello' }),
      spacing: 12,
    })

    expect(element.type).toBe('swiftui:vstack')
    expect(element.props.spacing).toBe(12)
    expect((element.props.children as { type: string }).type).toBe('swiftui:text')
  })
})
