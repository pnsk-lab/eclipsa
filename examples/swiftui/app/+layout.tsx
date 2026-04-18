import type { NativeChild } from '@eclipsa/native'

export default function RootLayout(props: { children?: NativeChild }) {
  return <windowGroup>{props.children}</windowGroup>
}
