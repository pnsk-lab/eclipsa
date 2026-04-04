import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { __eclipsaComponent } from '../../packages/eclipsa/core/internal.ts'
import { renderSSR } from '../../packages/eclipsa/core/ssr.ts'
import LandingPage, {
  SECTION_ORDER,
  VIEWPORT_SECTION_ANCHOR,
  resolveAbsoluteTrackFrames,
  resolveAbsoluteTrackValue,
  resolveFeatureOpacity,
  resolveFeatureRotation,
  resolveOrbitFollowOffsetX,
  resolveRightmostFeatureIndex,
  resolveSectionProgress,
  resolveSectionTrackValue,
  resolveTrackValue,
  resolveViewportAnchorY,
} from './+page.tsx'

const TestLandingPage = __eclipsaComponent(
  () => <LandingPage />,
  'landing-page-test',
  () => [],
)

describe('landing page', () => {
  it('uses the viewport top edge as the section anchor', () => {
    expect(VIEWPORT_SECTION_ANCHOR).toBe(0)
    expect(resolveViewportAnchorY(120, 640)).toBe(120)
  })

  it('interpolates individual track frames', () => {
    expect(
      resolveTrackValue(
        [
          { t: 0, x: 10 },
          { t: 0.5, x: 20 },
          { t: 1, x: 30 },
        ],
        0.25,
        'x',
      ),
    ).toBe(15)
  })

  it('projects section-local frames into absolute scroll positions', () => {
    const track = {
      hero: [{ t: 0, x: 0.83 }],
      statement: [{ t: 1, x: 0.5 }],
    } as const
    const ranges = {
      hero: { start: 0, end: 100 },
      statement: { start: 100, end: 300 },
    } as const

    expect(resolveAbsoluteTrackFrames(track, ranges, SECTION_ORDER)).toEqual([
      { position: 0, t: 0, x: 0.83 },
      { position: 300, t: 1, x: 0.5 },
    ])
    expect(
      resolveAbsoluteTrackValue(resolveAbsoluteTrackFrames(track, ranges, SECTION_ORDER), 150, 'x'),
    ).toBeCloseTo(0.665)
  })

  it('resolves section-relative track values across multiple sections', () => {
    const track = {
      hero: [
        { t: 0, x: 0.83 },
        { t: 1, x: 0.5 },
      ],
      statement: [
        { t: 0, x: 0.5 },
        { t: 1, x: 0.17 },
      ],
    } as const
    const ranges = {
      hero: { start: 0, end: 100 },
      statement: { start: 100, end: 300 },
    } as const

    expect(resolveSectionTrackValue(track, ranges, -10, 'x', SECTION_ORDER)).toBeCloseTo(0.83)
    expect(resolveSectionTrackValue(track, ranges, 50, 'x', SECTION_ORDER)).toBeCloseTo(0.665)
    expect(resolveSectionTrackValue(track, ranges, 200, 'x', SECTION_ORDER)).toBeCloseTo(0.335)
    expect(resolveSectionTrackValue(track, ranges, 350, 'x', SECTION_ORDER)).toBeCloseTo(0.17)
  })

  it('interpolates between section starts when consecutive sections only define t:0', () => {
    const track = {
      hero: [{ t: 0, x: 0.83 }],
      statement: [{ t: 0, x: 0.5 }],
      features: [{ t: 0, x: 0.17 }],
    } as const
    const ranges = {
      hero: { start: 0, end: 100 },
      statement: { start: 100, end: 300 },
      features: { start: 300, end: 500 },
    } as const

    expect(resolveSectionTrackValue(track, ranges, 50, 'x', SECTION_ORDER)).toBeCloseTo(0.665)
    expect(resolveSectionTrackValue(track, ranges, 200, 'x', SECTION_ORDER)).toBeCloseTo(0.335)
    expect(resolveSectionTrackValue(track, ranges, 450, 'x', SECTION_ORDER)).toBeCloseTo(0.17)
  })

  it('interpolates open from the hero start to the statement end', () => {
    const track = {
      hero: [{ t: 0, open: 0.15 }],
      statement: [{ t: 1, open: 1 }],
    } as const
    const ranges = {
      hero: { start: 0, end: 100 },
      statement: { start: 100, end: 300 },
    } as const

    expect(resolveSectionTrackValue(track, ranges, 0, 'open', SECTION_ORDER)).toBeCloseTo(0.15)
    expect(resolveSectionTrackValue(track, ranges, 150, 'open', SECTION_ORDER)).toBeCloseTo(0.575)
    expect(resolveSectionTrackValue(track, ranges, 300, 'open', SECTION_ORDER)).toBeCloseTo(1)
  })

  it('resolves per-section progress from measured ranges', () => {
    expect(resolveSectionProgress(undefined, 120)).toBe(0)
    expect(resolveSectionProgress({ start: 100, end: 300 }, 50)).toBe(-0.25)
    expect(resolveSectionProgress({ start: 100, end: 300 }, 200)).toBe(0.5)
    expect(resolveSectionProgress({ start: 100, end: 300 }, 350)).toBe(1)
  })

  it('inverts umbrella yaw for feature icon rotation so the visible spin matches', () => {
    expect(resolveFeatureRotation(0)).toBe(0)
    expect(resolveFeatureRotation(90)).toBe(-90)
    expect(resolveFeatureRotation(-45)).toBe(45)
  })

  it('marks only the rightmost feature card as fully opaque', () => {
    expect(resolveRightmostFeatureIndex(3, 0)).toBe(1)
    expect(resolveRightmostFeatureIndex(3, -120)).toBe(2)
    expect(resolveFeatureOpacity(1, 3, 0)).toBe(1)
    expect(resolveFeatureOpacity(0, 3, 0)).toBe(0.5)
    expect(resolveFeatureOpacity(2, 3, 0)).toBe(0.5)
  })

  it('resolves feature orbit x offsets from the umbrella viewport position', () => {
    expect(resolveOrbitFollowOffsetX(0.125, 1440, 180)).toBeCloseTo(0)
    expect(resolveOrbitFollowOffsetX(0.5, 1440, 180)).toBeCloseTo(540)
    expect(resolveOrbitFollowOffsetX(0.25, 1280, 240)).toBeCloseTo(80)
  })

  it('renders the landing sections without scroll reveal wrappers or hidden initial styles', () => {
    const result = renderSSR(() => <TestLandingPage />, {
      symbols: {},
    })

    expect(result.html).toContain('ECLIPSA')
    expect(result.html).toContain('Resumability')
    expect(result.html).toContain('Compiler')
    expect(result.html).toContain('Full-Stack')
    expect(result.html).not.toContain('translate3d(0px, 64px, 0px)')
    expect(result.html).not.toContain('will-change: opacity, transform')
  })

  it('renders feature cards with orbit layout CSS variables', () => {
    const result = renderSSR(() => <TestLandingPage />, {
      symbols: {},
    })

    expect(result.html).toContain('class="landing-features-orbit-anchor"')
    expect(result.html).toContain('class="landing-features-orbit"')
    expect(result.html).toContain('style="--feature-count:3"')
    expect(result.html).toContain('--feature-index: 0')
    expect(result.html).toContain('--feature-index: 1')
    expect(result.html).toContain('--feature-index: 2')
    expect(result.html).toContain('data-active="true"')
  })

  it('keeps feature orbit rotation out of SSR inline item styles', () => {
    const result = renderSSR(() => <TestLandingPage />, {
      symbols: {},
    })

    expect(result.html).not.toContain('--feature-rotation:')
    expect(result.html).not.toMatch(/landing-feature-card-icon[^>]*transform: rotate\(/)
  })

  it('inherits feature orbit rotation from the orbit root instead of resetting each item', () => {
    const stylesheet = readFileSync(new URL('./style.css', import.meta.url), 'utf8')
    const orbitItemRule = stylesheet.match(/\.landing-feature-orbit-item\s*\{[^}]+\}/)?.[0] ?? ''

    expect(stylesheet).toContain('.landing-features-orbit {')
    expect(stylesheet).toContain('--feature-rotation: 0deg;')
    expect(orbitItemRule).not.toContain('--feature-rotation:')
  })

  it('keeps the page horizontally clipped without breaking sticky sections', () => {
    const result = renderSSR(() => <TestLandingPage />, {
      symbols: {},
    })

    expect(result.html).toContain('overflow-x-clip')
    expect(result.html).not.toContain('overflow-x-hidden')
    expect(result.html).toContain(
      'class="sticky top-0 self-start pt-1 pl-10 flex h-dvh items-center justify-center"',
    )
    expect(result.html).toContain(
      'class="relative z-20 mx-auto w-full max-w-7xl px-6 grid grid-cols-4"',
    )
  })

  it('anchors the code sample with a dedicated sticky wrapper inside a tall parent', () => {
    const result = renderSSR(() => <TestLandingPage />, {
      symbols: {},
    })

    expect(result.html).toContain('class="relative mt-8 min-h-[200vh]"')
    expect(result.html).toContain(
      'class="sticky top-[30%] h-screen w-full flex flex-col items-center"',
    )
  })

  it('renders compile outputs as vertically stacked sections without changing the code block markup', () => {
    const result = renderSSR(() => <TestLandingPage />, {
      symbols: {},
    })

    expect(result.html).toContain('class="landing-compile-flow"')
    expect(result.html).not.toContain('class="landing-compile-connector"')
    expect(result.html).toContain('class="flex w-full gap-4"')
    expect(result.html).toContain(
      'class="bg-black/30 p-2 rounded-lg border border-purple-950/50 text-xl"',
    )
    expect(result.html).toContain(
      'class="bg-black/30 p-2 rounded-lg border border-purple-950/50 text-sm"',
    )
    expect(result.html).toContain(
      'class="landing-compile-rail landing-compile-rail-source flex w-7 flex-col"',
    )
    expect(result.html).toContain(
      'class="landing-compile-rail landing-compile-rail-client flex w-7 flex-col"',
    )
    expect(result.html).toContain(
      'class="landing-compile-rail landing-compile-rail-ssr flex w-7 flex-col"',
    )
    expect(result.html).toContain(
      'class="landing-compile-segment landing-compile-segment-horizontal mt-7 h-px w-full"',
    )
    expect(result.html).toContain(
      'class="landing-compile-segment landing-compile-segment-vertical grow w-px"',
    )
    expect(result.html).toContain('class="landing-compile-dot landing-compile-dot-source"')
    expect(result.html).toContain('class="landing-compile-dot landing-compile-dot-client"')
    expect(result.html).toContain('class="landing-compile-dot landing-compile-dot-ssr"')
    expect(result.html).toContain('YOUR CODE')
    expect(result.html).toContain('Client')
    expect(result.html).toContain('SSR')
  })

  it('defines vertical rail dot animations in the landing stylesheet', () => {
    const stylesheet = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

    expect(stylesheet).toContain('.landing-compile-flow {')
    expect(stylesheet).toContain(".landing-compile-flow[data-visible='true'] .landing-compile-dot")
    expect(stylesheet).toContain('.landing-compile-rail {')
    expect(stylesheet).toContain('.landing-compile-rail::before {')
    expect(stylesheet).toContain('.landing-compile-segment {')
    expect(stylesheet).toContain('.landing-compile-segment::after {')
    expect(stylesheet).toContain('@keyframes landing-compile-dot-source')
    expect(stylesheet).toContain('@keyframes landing-compile-dot-client')
    expect(stylesheet).toContain('@keyframes landing-compile-dot-ssr')
    expect(stylesheet).toContain('@keyframes landing-compile-node-pulse')
    expect(stylesheet).toContain('.landing-compile-dot-source {')
    expect(stylesheet).toContain('.landing-compile-dot-client {')
    expect(stylesheet).toContain('.landing-compile-dot-ssr {')
  })

  it('keeps the fixed canvas layer ahead of the hero section markup', () => {
    const result = renderSSR(() => <TestLandingPage />, {
      symbols: {},
    })

    expect(result.html).toContain(
      'class="pointer-events-none fixed inset-0 z-[1] h-screen w-screen"',
    )
    expect(result.html.indexOf('<canvas')).toBeGreaterThan(-1)
    expect(result.html.indexOf('id="hero"')).toBeGreaterThan(-1)
    expect(result.html.indexOf('<canvas')).toBeLessThan(result.html.indexOf('id="hero"'))
  })
})
