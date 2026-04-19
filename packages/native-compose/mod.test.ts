import { createElement } from '@eclipsa/native-core'
import { resolveNativeElementType } from '@eclipsa/native'
import { Activity, Column, COMPOSE_DEFAULT_TAG_MAP, Text } from './mod.ts'
import { describe, expect, it } from 'vitest'

describe('@eclipsa/native-compose', () => {
  it('exports the default Compose tag map', () => {
    expect(COMPOSE_DEFAULT_TAG_MAP.activity).toBe('compose:activity')
    expect(COMPOSE_DEFAULT_TAG_MAP.column).toBe('compose:column')
  })

  it('wraps primitives as native elements using the Compose tags', () => {
    const element = createElement(resolveNativeElementType(Activity), {
      children: createElement(resolveNativeElementType(Column), {
        children: createElement(resolveNativeElementType(Text), { value: 'Hello Compose' }),
        spacing: 16,
      }),
      title: 'Eclipsa Native Compose',
    })

    expect(element.type).toBe('compose:activity')
    expect(element.props.title).toBe('Eclipsa Native Compose')
    expect((element.props.children as { type: string }).type).toBe('compose:column')
  })
})
