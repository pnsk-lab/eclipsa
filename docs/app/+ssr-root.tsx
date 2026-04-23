import type { SSRRootProps } from 'eclipsa'
import './vite-env.d.ts'

export default function Root(props: SSRRootProps) {
  const docsThemeBootstrap = `(() => {
    const storageKey = "eclipsa-docs-theme";
    const root = document.documentElement;
    try {
      const stored = localStorage.getItem(storageKey);
      let resolved = "light";
      if (stored === "light" || stored === "dark") {
        resolved = stored;
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        resolved = "dark";
      }
      root.dataset.docsTheme = resolved;
    } catch (error) {
      root.dataset.docsTheme = "light";
    }
  })();`

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <title>Document</title>
        <script dangerouslySetInnerHTML={docsThemeBootstrap} />
        {import.meta.env.VITE_ERUDA && (
          <>
            <script src="https://cdn.jsdelivr.net/npm/eruda"></script>
            <script dangerouslySetInnerHTML="eruda.init();" />
          </>
        )}
        {props.head}
      </head>
      <body>{props.children}</body>
    </html>
  )
}
