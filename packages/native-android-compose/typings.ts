export namespace Android {
  export type ResourceReference = string
  export type Uri = string
}

export namespace AndroidX {
  export namespace Compose {
    export interface ViewProps {
      enabled?: boolean
      height?: number
      id?: string
      padding?: boolean | number
      size?: number
      visible?: boolean
      width?: number
    }

    export interface StackProps extends ViewProps {
      alignment?: 'center' | 'end' | 'start' | 'stretch'
      spacing?: number
    }

    export interface ActivityProps extends ViewProps {
      title?: string
    }

    export interface TextProps extends ViewProps {
      maxLines?: number
      value?: string
    }

    export interface ButtonProps extends ViewProps {
      onClick?: () => void
      title?: string
    }

    export interface ImageProps extends ViewProps {
      contentDescription?: string
      src?: Android.ResourceReference | Android.Uri
    }

    export interface TextFieldProps extends ViewProps {
      onValueChange?: (value: string) => void
      placeholder?: string
      value?: string
    }

    export interface SwitchProps extends ViewProps {
      onCheckedChange?: (value: boolean) => void
      title?: string
      value?: boolean
    }

    export interface LazyColumnProps extends ViewProps {
      selection?: string
      spacing?: number
    }
  }
}
