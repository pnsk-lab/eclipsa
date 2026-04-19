import type { NativeChild } from '@eclipsa/native'

export default function RootLayout(props: { children?: NativeChild }) {
  return <activity>{props.children}</activity>
}
