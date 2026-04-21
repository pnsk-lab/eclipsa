import type {
  AppRootProps,
  ButtonProps,
  ImageProps,
  ListProps,
  NativeChild,
  NativeElement,
  SpacerProps,
  SwitchProps,
  TextInputProps,
  TextProps,
  ViewProps,
} from '@eclipsa/native/runtime'
export * from '@eclipsa/native/runtime'
import { createElement } from '@eclipsa/native/runtime'
import {
  Button as SwiftUIButton,
  HStack,
  Image as SwiftUIImage,
  List as SwiftUIList,
  Spacer as SwiftUISpacer,
  Text as SwiftUIText,
  TextField as SwiftUITextField,
  Toggle as SwiftUIToggle,
  VStack,
  WindowGroup,
} from './mod.ts'

const toTextValue = (value: NativeChild): string => {
  if (Array.isArray(value)) {
    return value.map((child) => toTextValue(child)).join('')
  }
  if (value == null || typeof value === 'boolean') {
    return ''
  }
  return String(value)
}

export const AppRoot = (props: AppRootProps): NativeElement<object> =>
  createElement(WindowGroup, { children: props.children, title: props.title })

export const View = (props: ViewProps): NativeElement<object> =>
  props.direction === 'row'
    ? createElement(HStack, {
        children: props.children,
        padding: props.padding,
        spacing: props.spacing,
      })
    : createElement(VStack, {
        children: props.children,
        padding: props.padding,
        spacing: props.spacing,
      })

export const Text = (props: TextProps): NativeElement<object> =>
  createElement(SwiftUIText, { value: toTextValue(props.children) })

export const Button = (props: ButtonProps): NativeElement<object> =>
  createElement(SwiftUIButton, { onPress: props.onPress, title: props.title })

export const Image = (props: ImageProps): NativeElement<object> =>
  createElement(SwiftUIImage, { systemName: props.src || 'circle' })

export const TextInput = (props: TextInputProps): NativeElement<object> =>
  createElement(SwiftUITextField, {
    onInput: props.onChangeText,
    placeholder: props.placeholder,
    value: props.value,
  })

export const Switch = (props: SwitchProps): NativeElement<object> =>
  createElement(SwiftUIToggle, {
    onToggle: props.onValueChange,
    title: props.title,
    value: props.value,
  })

export const List = (props: ListProps): NativeElement<object> =>
  createElement(SwiftUIList, { children: props.children, spacing: props.spacing })

export const Spacer = (props: SpacerProps): NativeElement<object> =>
  createElement(SwiftUISpacer, {
    height: props.height,
    size: props.size,
    width: props.width,
  })
