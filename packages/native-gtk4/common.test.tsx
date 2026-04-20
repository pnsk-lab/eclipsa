import { resolveNativeElementType } from '@eclipsa/native/runtime'
import { AppRoot, Button, List, Switch, Text, TextInput, View } from './common.tsx'
import { describe, expect, it } from 'vitest'

describe('@eclipsa/native-gtk4 common entry', () => {
  it('maps shared components to the GTK4 primitives', () => {
    const onPress = () => {}
    const onChangeText = (_value: string) => {}
    const onValueChange = (_value: boolean) => {}
    const element = AppRoot({
      children: View({
        children: List({
          children: [
            Text({ children: 'Hello GTK4' }),
            Button({ onPress, title: 'Count 1' }),
            TextInput({ onChangeText, placeholder: 'Name', value: 'GTK4' }),
            Switch({ onValueChange, title: 'Enabled', value: true }),
          ],
          spacing: 18,
        }),
        direction: 'column',
        spacing: 12,
      }),
      title: 'Eclipsa Native GTK4',
    })

    expect(resolveNativeElementType(element.type)).toBe('gtk4:application-window')
    const view = element.props.children as { props: { children: unknown }; type: unknown }
    expect(resolveNativeElementType(view.type)).toBe('gtk4:box')
    const list = view.props.children as {
      props: {
        children: Array<{ props: Record<string, unknown>; type: unknown }>
      } & Record<string, unknown>
      type: unknown
    }
    expect(resolveNativeElementType(list.type)).toBe('gtk4:list-view')
    expect(list.props.spacing).toBe(18)
    expect(resolveNativeElementType(list.props.children[1]!.type)).toBe('gtk4:button')
    expect(list.props.children[1]!.props.onClick).toBe(onPress)
    expect(resolveNativeElementType(list.props.children[2]!.type)).toBe('gtk4:text-input')
    expect(list.props.children[2]!.props.onInput).toBe(onChangeText)
    expect(resolveNativeElementType(list.props.children[3]!.type)).toBe('gtk4:switch')
    expect(list.props.children[3]!.props.onToggle).toBe(onValueChange)
  })

  it('preserves explicit text values without requiring children', () => {
    const element = Text({ value: 'Hello GTK4' })

    expect(resolveNativeElementType(element.type)).toBe('gtk4:text')
    expect(element.props.value).toBe('Hello GTK4')
  })
})
