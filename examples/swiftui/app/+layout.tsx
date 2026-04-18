import type { NativeChild } from '@eclipsa/native'
import { WindowGroup } from '@eclipsa/native-swiftui'

export default function RootLayout(props: { children?: NativeChild }) {
  return <WindowGroup>{props.children}</WindowGroup>
}
