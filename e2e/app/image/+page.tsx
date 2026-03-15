import { component$ } from 'eclipsa'
import { Image } from '@eclipsa/image'
import hero from '../images/hero-image.ts'

export const metadata = {
  title: 'Image | /image',
}

export default component$(() => {
  return (
    <main>
      <h1>Image Playground</h1>
      <p>Responsive image metadata should survive navigation, resume, and HMR.</p>
      <Image
        alt="Decorative Eclipsa image"
        data-testid="responsive-image"
        sizes="(min-width: 960px) 720px, 100vw"
        src={hero}
      />
    </main>
  )
})
