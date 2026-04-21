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
  ApplicationWindow,
  Box,
  Button as GtkButton,
  Image as GtkImage,
  ListView,
  Spacer as GtkSpacer,
  Switch as GtkSwitch,
  Text as GtkText,
  TextInput as GtkTextInput,
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
  createElement(ApplicationWindow, { children: props.children, title: props.title })

export const View = (props: ViewProps): NativeElement<object> =>
  createElement(Box, {
    children: props.children,
    direction: props.direction,
    padding: props.padding,
    spacing: props.spacing,
  })

export const Text = (props: TextProps): NativeElement<object> =>
  createElement(GtkText, {
    value: props.value ?? toTextValue(props.children),
  })

export const Button = (props: ButtonProps): NativeElement<object> =>
  createElement(GtkButton, { onClick: props.onPress, title: props.title })

export const Image = (props: ImageProps): NativeElement<object> =>
  createElement(GtkImage, { alt: props.alt, src: props.src })

export const TextInput = (props: TextInputProps): NativeElement<object> =>
  createElement(GtkTextInput, {
    onInput: props.onChangeText,
    placeholder: props.placeholder,
    value: props.value,
  })

export const Switch = (props: SwitchProps): NativeElement<object> =>
  createElement(GtkSwitch, {
    onToggle: props.onValueChange,
    title: props.title,
    value: props.value,
  })

export const List = (props: ListProps): NativeElement<object> =>
  createElement(ListView, { children: props.children, spacing: props.spacing })

export const Spacer = (props: SpacerProps): NativeElement<object> =>
  createElement(GtkSpacer, {
    height: props.height,
    size: props.size,
    width: props.width,
  })
