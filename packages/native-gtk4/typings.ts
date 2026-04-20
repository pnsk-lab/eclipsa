export namespace GLib {
  export type Uri = string
}

export namespace Gio {
  export type IconName = string
  export type ResourcePath = string
}

export namespace Gtk {
  export type Align = 'baseline' | 'center' | 'end' | 'fill' | 'start'
  export type Orientation = 'horizontal' | 'vertical'
  export type SelectionMode = 'browse' | 'multiple' | 'none' | 'single'

  export interface WidgetProps {
    cssClasses?: readonly string[] | string
    halign?: Align
    hexpand?: boolean
    id?: string
    margin?: number
    sensitive?: boolean
    valign?: Align
    vexpand?: boolean
    visible?: boolean
  }

  export interface WindowProps extends WidgetProps {
    defaultHeight?: number
    defaultWidth?: number
    title?: string
  }

  export interface BoxProps extends WidgetProps {
    homogeneous?: boolean
    orientation?: Orientation
    spacing?: number
  }

  export interface TextProps extends WidgetProps {
    selectable?: boolean
    value?: string
    wrap?: boolean
    xalign?: number
  }

  export interface ButtonProps extends WidgetProps {
    onClick?: () => void
    title?: string
  }

  export interface ImageProps extends WidgetProps {
    iconName?: Gio.IconName
    pixelSize?: number
    src?: Gio.ResourcePath | GLib.Uri
  }

  export interface TextFieldProps extends WidgetProps {
    onInput?: (value: string) => void
    placeholder?: string
    value?: string
    visibility?: boolean
  }

  export interface SwitchProps extends WidgetProps {
    onToggle?: (value: boolean) => void
    title?: string
    value?: boolean
  }

  export interface ListBoxProps extends WidgetProps {
    selectionMode?: SelectionMode
  }
}
