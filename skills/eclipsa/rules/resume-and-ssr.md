# Resume And SSR

## Core Model

- Eclipsa renders HTML on the server.
- The browser resumes interactivity from that output.
- Normal app code should assume SSR first, then client resume.

## Client Boot

- Keep `app/+client.dev.tsx` on:

```tsx
import { resumeContainer } from 'eclipsa'

resumeContainer(document)
```

- Do not replace this with a custom client render boot unless the user explicitly needs a low-level experiment.

## App-Level Cautions

- Avoid assuming browser-only globals are available during SSR.
- Put browser-only setup behind lifecycle hooks such as `onMount()`.
- Keep loader and action data serializable so SSR payloads and resume stay reliable.
- Prefer Eclipsa navigation primitives over manual full-page reload patterns.

## Good Mental Shortcut

- Think "resume" rather than "hydrate the entire page".
- Build pages and layouts so the server output is already meaningful before any client code runs.
