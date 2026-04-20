/** @jsxImportSource @eclipsa/native */

import { resolveNativeElementType } from '@eclipsa/native/runtime'
import { AppRoot, Switch, Text, TextInput, View } from './common.tsx'
import { describe, expect, it } from 'vitest'

describe('@eclipsa/native-swiftui common entry', () => {
  it('maps shared components to the SwiftUI primitives', () => {
    const element = AppRoot({
      children: View({
        children: [
          Text({ children: 'Hello SwiftUI' }),
          TextInput({ placeholder: 'Name', value: 'SwiftUI' }),
          Switch({ title: 'Enabled', value: true }),
        ],
        direction: 'row',
        spacing: 12,
      }),
      title: 'Eclipsa Native SwiftUI',
    })

    expect(resolveNativeElementType(element.type)).toBe('swiftui:window-group')
    const view = element.props.children as { props: { children: unknown[] }; type: unknown }
    expect(resolveNativeElementType(view.type)).toBe('swiftui:hstack')
    const [text, input, toggle] = view.props.children as Array<{
      props: Record<string, unknown>
      type: unknown
    }>
    expect(resolveNativeElementType(text.type)).toBe('swiftui:text')
    expect(text.props.value).toBe('Hello SwiftUI')
    expect(resolveNativeElementType(input.type)).toBe('swiftui:text-field')
    expect(resolveNativeElementType(toggle.type)).toBe('swiftui:toggle')
  })
})
