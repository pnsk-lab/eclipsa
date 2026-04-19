import { defineNativeComponent } from '@eclipsa/native'
import type { DefinedNativeComponent } from '@eclipsa/native'
import type { Gio, GLib, Gtk } from './typings.ts'
import { GTK4_DEFAULT_TAG_MAP } from './platform.ts'

export type { Gio, GLib, Gtk } from './typings.ts'
export { GTK4_DEFAULT_TAG_MAP } from './platform.ts'

export const Application: DefinedNativeComponent<Gtk.ApplicationProps> =
  defineNativeComponent<Gtk.ApplicationProps>(GTK4_DEFAULT_TAG_MAP.application)
export const Window: DefinedNativeComponent<Gtk.WindowProps> =
  defineNativeComponent<Gtk.WindowProps>(GTK4_DEFAULT_TAG_MAP.window)
export const Box: DefinedNativeComponent<Gtk.BoxProps> = defineNativeComponent<Gtk.BoxProps>(
  GTK4_DEFAULT_TAG_MAP.box,
)
export const Text: DefinedNativeComponent<Gtk.TextProps> = defineNativeComponent<Gtk.TextProps>(
  GTK4_DEFAULT_TAG_MAP.text,
)
export const Button: DefinedNativeComponent<Gtk.ButtonProps> =
  defineNativeComponent<Gtk.ButtonProps>(GTK4_DEFAULT_TAG_MAP.button)
export const Spacer: DefinedNativeComponent<Gtk.WidgetProps> =
  defineNativeComponent<Gtk.WidgetProps>(GTK4_DEFAULT_TAG_MAP.spacer)
export const Image: DefinedNativeComponent<Gtk.ImageProps> = defineNativeComponent<Gtk.ImageProps>(
  GTK4_DEFAULT_TAG_MAP.image,
)
export const TextField: DefinedNativeComponent<Gtk.TextFieldProps> =
  defineNativeComponent<Gtk.TextFieldProps>(GTK4_DEFAULT_TAG_MAP.textField)
export const Switch: DefinedNativeComponent<Gtk.SwitchProps> =
  defineNativeComponent<Gtk.SwitchProps>(GTK4_DEFAULT_TAG_MAP.switch)
export const ListBox: DefinedNativeComponent<Gtk.ListBoxProps> =
  defineNativeComponent<Gtk.ListBoxProps>(GTK4_DEFAULT_TAG_MAP.listBox)
