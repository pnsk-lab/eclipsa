export namespace Foundation {
  export type LocalizedStringKey = string
  export type URL = string
}

export namespace SwiftUI {
  export interface ViewProps {
    disabled?: boolean
    height?: number
    hidden?: boolean
    id?: string
    padding?: boolean | number
    size?: number
    width?: number
  }

  export interface StackProps extends ViewProps {
    alignment?: 'center' | 'leading' | 'trailing'
    spacing?: number
  }

  export interface SceneProps extends ViewProps {
    title?: string
  }

  export interface TextProps extends ViewProps {
    value?: Foundation.LocalizedStringKey | string
    verbatim?: string
  }

  export interface ButtonProps extends ViewProps {
    onPress?: () => void
    role?: 'cancel' | 'destructive' | 'none'
    title?: string
  }

  export interface ImageProps extends ViewProps {
    systemName?: string
  }

  export interface TextFieldProps extends ViewProps {
    onInput?: (value: string) => void
    placeholder?: string
    value?: string
  }

  export interface ToggleProps extends ViewProps {
    onToggle?: (value: boolean) => void
    title?: string
    value?: boolean
  }

  export interface ListProps extends ViewProps {
    selection?: string
    spacing?: number
  }
}
