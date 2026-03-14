import { component$ } from 'eclipsa'

export default component$(() => {
  return (
    <main>
      <h2>SVG HMR Probe</h2>
      <p data-testid="hmr-status">svg hmr before</p>
      <svg
        aria-hidden="true"
        class="h-6 w-6 text-sky-500"
        data-testid="hmr-icon"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        viewBox="0 0 24 24"
      >
        <path d="M12 3v18" />
        <path d="M3 12h18" />
      </svg>
    </main>
  )
})
