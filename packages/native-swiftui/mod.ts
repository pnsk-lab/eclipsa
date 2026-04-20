import { defineNativeComponent } from '@eclipsa/native/runtime'
import type { DefinedNativeComponent } from '@eclipsa/native/runtime'
import type { SwiftUI } from './typings.ts'
import { SWIFTUI_DEFAULT_TAG_MAP } from './platform.ts'

export type { Foundation, SwiftUI } from './typings.ts'
export { SWIFTUI_DEFAULT_TAG_MAP } from './platform.ts'

export const WindowGroup: DefinedNativeComponent<SwiftUI.SceneProps> =
  defineNativeComponent<SwiftUI.SceneProps>(SWIFTUI_DEFAULT_TAG_MAP.windowGroup)
export const VStack: DefinedNativeComponent<SwiftUI.StackProps> =
  defineNativeComponent<SwiftUI.StackProps>(SWIFTUI_DEFAULT_TAG_MAP.vstack)
export const HStack: DefinedNativeComponent<SwiftUI.StackProps> =
  defineNativeComponent<SwiftUI.StackProps>(SWIFTUI_DEFAULT_TAG_MAP.hstack)
export const Text: DefinedNativeComponent<SwiftUI.TextProps> =
  defineNativeComponent<SwiftUI.TextProps>(SWIFTUI_DEFAULT_TAG_MAP.text)
export const Button: DefinedNativeComponent<SwiftUI.ButtonProps> =
  defineNativeComponent<SwiftUI.ButtonProps>(SWIFTUI_DEFAULT_TAG_MAP.button)
export const Spacer: DefinedNativeComponent<SwiftUI.ViewProps> =
  defineNativeComponent<SwiftUI.ViewProps>(SWIFTUI_DEFAULT_TAG_MAP.spacer)
export const Image: DefinedNativeComponent<SwiftUI.ImageProps> =
  defineNativeComponent<SwiftUI.ImageProps>(SWIFTUI_DEFAULT_TAG_MAP.image)
export const TextField: DefinedNativeComponent<SwiftUI.TextFieldProps> =
  defineNativeComponent<SwiftUI.TextFieldProps>(SWIFTUI_DEFAULT_TAG_MAP.textField)
export const Toggle: DefinedNativeComponent<SwiftUI.ToggleProps> =
  defineNativeComponent<SwiftUI.ToggleProps>(SWIFTUI_DEFAULT_TAG_MAP.toggle)
export const List: DefinedNativeComponent<SwiftUI.ListProps> =
  defineNativeComponent<SwiftUI.ListProps>(SWIFTUI_DEFAULT_TAG_MAP.list)
