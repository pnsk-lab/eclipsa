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
  Activity,
  Button as ComposeButton,
  Column,
  Image as ComposeImage,
  LazyColumn,
  Row,
  Spacer as ComposeSpacer,
  Switch as ComposeSwitch,
  Text as ComposeText,
  TextField as ComposeTextField,
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
  createElement(Activity, { children: props.children, title: props.title })

export const View = (props: ViewProps): NativeElement<object> =>
  props.direction === 'row'
    ? createElement(Row, {
        children: props.children,
        padding: props.padding,
        spacing: props.spacing,
      })
    : createElement(Column, {
        children: props.children,
        padding: props.padding,
        spacing: props.spacing,
      })

export const Text = (props: TextProps): NativeElement<object> =>
  createElement(ComposeText, { value: toTextValue(props.children) })

export const Button = (props: ButtonProps): NativeElement<object> =>
  createElement(ComposeButton, { onClick: props.onPress, title: props.title })

export const Image = (props: ImageProps): NativeElement<object> =>
  createElement(ComposeImage, { contentDescription: props.alt, src: props.src })

export const TextInput = (props: TextInputProps): NativeElement<object> =>
  createElement(ComposeTextField, {
    onValueChange: props.onChangeText,
    placeholder: props.placeholder,
    value: props.value,
  })

export const Switch = (props: SwitchProps): NativeElement<object> =>
  createElement(ComposeSwitch, {
    onCheckedChange: props.onValueChange,
    title: props.title,
    value: props.value,
  })

export const List = (props: ListProps): NativeElement<object> =>
  createElement(LazyColumn, { children: props.children, spacing: props.spacing })

export const Spacer = (props: SpacerProps): NativeElement<object> =>
  createElement(ComposeSpacer, {
    height: props.height,
    size: props.size,
    width: props.width,
  })
