import type { ImageSource } from '@eclipsa/image'

// TypeScript does not currently resolve this Vite query import in the e2e app.
// The plugin still owns the runtime module shape.
// @ts-expect-error Vite query imports are provided by @eclipsa/image during bundling.
import hero from './hero.png?eclipsa-image'

export default hero as ImageSource
