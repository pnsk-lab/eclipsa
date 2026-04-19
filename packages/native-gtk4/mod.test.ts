import { createElement } from '@eclipsa/native-core'
import { resolveNativeElementType } from '@eclipsa/native'
import * as gtk4 from './mod.ts'
import { describe, expect, it } from 'vitest'

describe('@eclipsa/native-gtk4', () => {
  it('exports the default GTK 4 tag map', () => {
    expect(gtk4.GTK4_DEFAULT_TAG_MAP.window).toBe('gtk4:window')
    expect(gtk4.GTK4_DEFAULT_TAG_MAP.box).toBe('gtk4:box')
    expect('application' in gtk4.GTK4_DEFAULT_TAG_MAP).toBe(false)
    expect('Application' in gtk4).toBe(false)
  })

  it('wraps primitives as native elements using the GTK 4 tags', () => {
    const element = createElement(resolveNativeElementType(gtk4.Window), {
      children: createElement(resolveNativeElementType(gtk4.Box), {
        children: createElement(resolveNativeElementType(gtk4.Text), { value: 'Hello GTK 4' }),
        orientation: 'vertical',
        spacing: 12,
      }),
      title: 'Eclipsa Native GTK 4',
    })

    expect(element.type).toBe('gtk4:window')
    expect(element.props.title).toBe('Eclipsa Native GTK 4')
    expect((element.props.children as { type: string }).type).toBe('gtk4:box')
  })
})
