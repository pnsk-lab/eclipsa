import { defineNativeComponent } from '@eclipsa/native/runtime'
import type { DefinedNativeComponent } from '@eclipsa/native/runtime'
import type { GTK } from './typings.ts'
import { GTK4_DEFAULT_TAG_MAP } from './platform.ts'

export type { GTK } from './typings.ts'
export { GTK4_DEFAULT_COMPONENT_MAP, GTK4_DEFAULT_TAG_MAP } from './platform.ts'

export const ApplicationWindow: DefinedNativeComponent<GTK.WindowProps> =
  defineNativeComponent<GTK.WindowProps>(GTK4_DEFAULT_TAG_MAP.applicationWindow)
export const Box: DefinedNativeComponent<GTK.BoxProps> = defineNativeComponent<GTK.BoxProps>(
  GTK4_DEFAULT_TAG_MAP.box,
)
export const Text: DefinedNativeComponent<GTK.TextProps> = defineNativeComponent<GTK.TextProps>(
  GTK4_DEFAULT_TAG_MAP.text,
)
export const Button: DefinedNativeComponent<GTK.ButtonProps> =
  defineNativeComponent<GTK.ButtonProps>(GTK4_DEFAULT_TAG_MAP.button)
export const Image: DefinedNativeComponent<GTK.ImageProps> = defineNativeComponent<GTK.ImageProps>(
  GTK4_DEFAULT_TAG_MAP.image,
)
export const TextInput: DefinedNativeComponent<GTK.TextInputProps> =
  defineNativeComponent<GTK.TextInputProps>(GTK4_DEFAULT_TAG_MAP.textInput)
export const TextField: DefinedNativeComponent<GTK.TextInputProps> =
  defineNativeComponent<GTK.TextInputProps>('gtk4:text-field')
export const Switch: DefinedNativeComponent<GTK.SwitchProps> =
  defineNativeComponent<GTK.SwitchProps>(GTK4_DEFAULT_TAG_MAP.switch)
export const ListView: DefinedNativeComponent<GTK.ListProps> = defineNativeComponent<GTK.ListProps>(
  GTK4_DEFAULT_TAG_MAP.list,
)
export const Spacer: DefinedNativeComponent<GTK.WidgetProps> =
  defineNativeComponent<GTK.WidgetProps>(GTK4_DEFAULT_TAG_MAP.spacer)
export const Window: DefinedNativeComponent<GTK.WindowProps> =
  defineNativeComponent<GTK.WindowProps>('gtk4:window')
