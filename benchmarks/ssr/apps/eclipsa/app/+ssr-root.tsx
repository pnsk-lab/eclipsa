import type { SSRRootProps } from 'eclipsa'

export default function Root(props: SSRRootProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {props.head}
      </head>
      <body>{props.children}</body>
    </html>
  )
}
