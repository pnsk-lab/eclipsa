import { Link } from 'eclipsa'

export default () => (
  <section>
    <h2>Hash Navigation</h2>
    <p>Client-side fragment navigation should preserve native anchor scrolling.</p>
    <p>
      <Link href="#deep-dive">Jump to deep dive</Link>
    </p>
    <div style="height: 3000px;" />
    <h3 id="deep-dive" data-testid="hash-nav-target">
      Deep Dive Target
    </h3>
    <p data-testid="hash-nav-target-copy">The target should be scrolled into view.</p>
  </section>
)
