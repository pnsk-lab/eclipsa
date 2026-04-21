/** @jsxImportSource @eclipsa/native */

import { resolveNativeElementType } from '@eclipsa/native/runtime'
import { AppRoot, List, Text, TextInput, View } from './common.tsx'
import { describe, expect, it } from 'vitest'

describe('@eclipsa/native-android-compose common entry', () => {
  it('maps shared components to the Compose primitives', () => {
    const element = AppRoot({
      children: View({
        children: List({
          children: [
            Text({ children: 'Hello Compose' }),
            TextInput({ placeholder: 'Name', value: 'Compose' }),
          ],
          spacing: 16,
        }),
        direction: 'column',
        spacing: 12,
      }),
      title: 'Eclipsa Native Compose',
    })

    expect(resolveNativeElementType(element.type)).toBe('compose:activity')
    const view = element.props.children as { props: { children: unknown }; type: unknown }
    expect(resolveNativeElementType(view.type)).toBe('compose:column')
    const list = view.props.children as { props: Record<string, unknown>; type: unknown }
    expect(resolveNativeElementType(list.type)).toBe('compose:lazy-column')
    expect(list.props.spacing).toBe(16)
  })
})
