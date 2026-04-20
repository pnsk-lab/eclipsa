import { createElement } from '@eclipsa/native-core'
import { resolveNativeElementType } from '@eclipsa/native/runtime'
import { ApplicationWindow, Box, GTK4_DEFAULT_TAG_MAP, Text } from './mod.ts'
import { describe, expect, it } from 'vitest'

describe('@eclipsa/native-gtk4', () => {
  it('exports the default GTK4 tag map', () => {
    expect(GTK4_DEFAULT_TAG_MAP.applicationWindow).toBe('gtk4:application-window')
    expect(GTK4_DEFAULT_TAG_MAP.box).toBe('gtk4:box')
  })

  it('wraps primitives as native elements using the GTK4 tags', () => {
    const element = createElement(resolveNativeElementType(ApplicationWindow), {
      children: createElement(resolveNativeElementType(Box), {
        children: createElement(resolveNativeElementType(Text), { value: 'Hello GTK4' }),
        spacing: 10,
      }),
      title: 'Eclipsa Native GTK4',
    })

    expect(element.type).toBe('gtk4:application-window')
    expect((element.props.children as { type: string }).type).toBe('gtk4:box')
  })
})
