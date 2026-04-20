import type { NativeChild, NativeComponent } from '@eclipsa/native-core'

const createUnavailableNativeCommonComponent = <P extends object>(name: string) =>
  (() => {
    throw new Error(
      `@eclipsa/native ${name} requires the native Vite plugin to alias the package to a concrete target common entry.`,
    )
  }) as unknown as NativeComponent<P & { children?: NativeChild }>

export interface AppRootProps {
  children?: NativeChild
  title?: string
}

export interface ViewProps {
  children?: NativeChild
  direction?: 'column' | 'row'
  padding?: number
  spacing?: number
}

export interface TextProps {
  children?: NativeChild
  value?: string
}

export interface ButtonProps {
  onPress?: () => void
  title?: string
}

export interface ImageProps {
  alt?: string
  src: string
}

export interface TextInputProps {
  onChangeText?: (value: string) => void
  placeholder?: string
  value?: string
}

export interface SwitchProps {
  onValueChange?: (value: boolean) => void
  title?: string
  value?: boolean
}

export interface ListProps {
  children?: NativeChild
  spacing?: number
}

export interface SpacerProps {
  height?: number
  size?: number
  width?: number
}

export const AppRoot = createUnavailableNativeCommonComponent<AppRootProps>('AppRoot')
export const View = createUnavailableNativeCommonComponent<ViewProps>('View')
export const Text = createUnavailableNativeCommonComponent<TextProps>('Text')
export const Button = createUnavailableNativeCommonComponent<ButtonProps>('Button')
export const Image = createUnavailableNativeCommonComponent<ImageProps>('Image')
export const TextInput = createUnavailableNativeCommonComponent<TextInputProps>('TextInput')
export const Switch = createUnavailableNativeCommonComponent<SwitchProps>('Switch')
export const List = createUnavailableNativeCommonComponent<ListProps>('List')
export const Spacer = createUnavailableNativeCommonComponent<SpacerProps>('Spacer')
