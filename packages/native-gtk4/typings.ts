export namespace GTK {
  export interface WidgetProps {
    height?: number
    id?: string
    padding?: boolean | number
    size?: number
    visible?: boolean
    width?: number
  }

  export interface WindowProps extends WidgetProps {
    title?: string
  }

  export interface BoxProps extends WidgetProps {
    direction?: 'column' | 'row'
    spacing?: number
  }

  export interface TextProps extends WidgetProps {
    value?: string
  }

  export interface ButtonProps extends WidgetProps {
    onClick?: () => void
    title?: string
  }

  export interface ImageProps extends WidgetProps {
    alt?: string
    src?: string
  }

  export interface TextInputProps extends WidgetProps {
    onInput?: (value: string) => void
    placeholder?: string
    value?: string
  }

  export interface SwitchProps extends WidgetProps {
    onToggle?: (value: boolean) => void
    title?: string
    value?: boolean
  }

  export interface ListProps extends WidgetProps {
    spacing?: number
  }
}
