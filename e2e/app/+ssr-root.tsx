import type { SSRRootProps } from 'eclipsa'
import './vite-env.d.ts'

export default function Root(props: SSRRootProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {import.meta.env.VITE_ERUDA && (
          <>
            <script src="https://cdn.jsdelivr.net/npm/eruda"></script>
            <script>eruda.init();</script>
          </>
        )}
        {props.head}
      </head>
      <body>{props.children}</body>
    </html>
  )
}
