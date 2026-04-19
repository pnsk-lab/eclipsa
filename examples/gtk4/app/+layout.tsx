import type { NativeChild } from '@eclipsa/native'

export default function RootLayout(props: { children?: NativeChild }) {
  return (
    <window defaultHeight={720} defaultWidth={480} title="Eclipsa Native GTK 4 Example">
      {props.children}
    </window>
  )
}
