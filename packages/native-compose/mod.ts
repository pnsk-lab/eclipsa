import { defineNativeComponent } from '@eclipsa/native'
import type { DefinedNativeComponent } from '@eclipsa/native'
import type { Android, AndroidX } from './typings.ts'
import { COMPOSE_DEFAULT_TAG_MAP } from './platform.ts'

export type { Android, AndroidX } from './typings.ts'
export { COMPOSE_DEFAULT_TAG_MAP } from './platform.ts'

export const Activity: DefinedNativeComponent<AndroidX.Compose.ActivityProps> =
  defineNativeComponent<AndroidX.Compose.ActivityProps>(COMPOSE_DEFAULT_TAG_MAP.activity)
export const Column: DefinedNativeComponent<AndroidX.Compose.StackProps> =
  defineNativeComponent<AndroidX.Compose.StackProps>(COMPOSE_DEFAULT_TAG_MAP.column)
export const Row: DefinedNativeComponent<AndroidX.Compose.StackProps> =
  defineNativeComponent<AndroidX.Compose.StackProps>(COMPOSE_DEFAULT_TAG_MAP.row)
export const Text: DefinedNativeComponent<AndroidX.Compose.TextProps> =
  defineNativeComponent<AndroidX.Compose.TextProps>(COMPOSE_DEFAULT_TAG_MAP.text)
export const Button: DefinedNativeComponent<AndroidX.Compose.ButtonProps> =
  defineNativeComponent<AndroidX.Compose.ButtonProps>(COMPOSE_DEFAULT_TAG_MAP.button)
export const Spacer: DefinedNativeComponent<AndroidX.Compose.ViewProps> =
  defineNativeComponent<AndroidX.Compose.ViewProps>(COMPOSE_DEFAULT_TAG_MAP.spacer)
export const Image: DefinedNativeComponent<AndroidX.Compose.ImageProps> =
  defineNativeComponent<AndroidX.Compose.ImageProps>(COMPOSE_DEFAULT_TAG_MAP.image)
export const TextField: DefinedNativeComponent<AndroidX.Compose.TextFieldProps> =
  defineNativeComponent<AndroidX.Compose.TextFieldProps>(COMPOSE_DEFAULT_TAG_MAP.textField)
export const Switch: DefinedNativeComponent<AndroidX.Compose.SwitchProps> =
  defineNativeComponent<AndroidX.Compose.SwitchProps>(COMPOSE_DEFAULT_TAG_MAP.switch)
export const LazyColumn: DefinedNativeComponent<AndroidX.Compose.LazyColumnProps> =
  defineNativeComponent<AndroidX.Compose.LazyColumnProps>(COMPOSE_DEFAULT_TAG_MAP.lazyColumn)
