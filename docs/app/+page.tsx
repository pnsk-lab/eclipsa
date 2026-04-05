import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from '@eclipsa/motion'
import { Link, onCleanup, onMount, useSignal, type Signal } from 'eclipsa'
import { useLandingScene } from './use-landing-scene.ts'
import { Image } from '@eclipsa/image'
import '@eclipsa/image/client'
import routingVscodeImage from '../assets/routing-vscode.png?eclipsa-image'

export const SECTION_ORDER = ['hero', 'statement', 'features', 'footer'] as const

type LandingSectionName = (typeof SECTION_ORDER)[number]
type SectionRefMap = Record<LandingSectionName, Signal<HTMLElement | undefined>>
type SectionRangeMap = Partial<Record<LandingSectionName, { end: number; start: number }>>
type SectionMeasurements = {
  anchorY: MotionValue<number>
  ranges: MotionValue<SectionRangeMap>
}
type TrackFrame<Field extends string> = { t: number } & Record<Field, number>
type AbsoluteTrackFrame<Field extends string> = { position: number } & Record<Field, number>
type SectionTrackMap<Field extends string> = Partial<
  Record<LandingSectionName, ReadonlyArray<TrackFrame<Field>>>
>

const OPEN = {
  hero: [
    { t: 0, open: 0.15 },
    { t: 1, open: 1 },
  ],
  statement: [],
} satisfies SectionTrackMap<'open'>

const ROTATE = {
  hero: [
    { t: 0, x: -80, y: 0, z: 30 },
    { t: 0.5, x: -80, y: 0, z: 30 },
    { t: 1, x: -60, y: 0, z: -7 },
  ],
  statement: [{ t: 1, x: 0, y: 0, z: 0 }],
  features: [
    {
      t: 0.2,
      x: 0,
      y: 0,
      z: 0,
    },
    {
      t: 1,
      x: 0,
      y: 360 * 1,
      z: 0,
    },
  ],
} satisfies SectionTrackMap<'x' | 'y' | 'z'>

const SIZE = {
  hero: [{ t: 0, size: 0.6 }],
} satisfies SectionTrackMap<'size'>

const POS = {
  hero: [
    { t: 0, x: 0.83, y: 0.48 },
    { t: 1, x: 0.5, y: 0.5 },
  ],
  statement: [
    { t: 0, x: 0.5, y: 0.5 },
    //{ t: 0.5, x: 0.3, y: 0.5 },
    //{ t: 1, x: 0.125, y: 0.5 },
  ],
  features: [
    { t: 0.1, x: 0.5, y: 0.5 },
    { t: 0.2, x: 0.125, y: 0.5 },
  ],
} satisfies SectionTrackMap<'x' | 'y'>

const FEATURE_ITEMS = [
  { iconClass: 'i-tabler-droplet-bolt', title: 'Resumability' },
  { iconClass: 'i-tabler-cpu', title: 'Compiler' },
  { iconClass: 'i-tabler-protocol', title: 'Full-Stack' },
]
export const VIEWPORT_SECTION_ANCHOR = 0

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const getFirstTrackValue = <Field extends string>(
  tracks: SectionTrackMap<Field>,
  key: Field,
  order: readonly LandingSectionName[] = SECTION_ORDER,
) => {
  for (const section of order) {
    const frames = tracks[section]
    if (frames?.length) {
      return frames[0][key]
    }
  }

  return 0
}

export const resolveTrackValue = <Field extends string>(
  frames: ReadonlyArray<TrackFrame<Field>>,
  progress: number,
  key: Field,
) => {
  if (frames.length === 0) {
    return 0
  }

  const normalized = clamp01(progress)
  if (normalized <= frames[0].t) {
    return frames[0][key]
  }

  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]
    const current = frames[index]
    if (normalized <= current.t) {
      const span = current.t - previous.t
      if (span <= 0) {
        return current[key]
      }
      const localProgress = (normalized - previous.t) / span
      return previous[key] + (current[key] - previous[key]) * localProgress
    }
  }

  return frames[frames.length - 1][key]
}

export const resolveAbsoluteTrackFrames = <Field extends string>(
  tracks: SectionTrackMap<Field>,
  ranges: SectionRangeMap,
  order: readonly LandingSectionName[] = SECTION_ORDER,
) => {
  const absoluteFrames: AbsoluteTrackFrame<Field>[] = []

  for (const section of order) {
    const frames = tracks[section]
    const range = ranges[section]
    if (!frames?.length || !range) {
      continue
    }

    const span = Math.max(0, range.end - range.start)
    for (const frame of frames) {
      absoluteFrames.push({
        ...frame,
        position: range.start + span * clamp01(frame.t),
      })
    }
  }

  absoluteFrames.sort((left, right) => left.position - right.position)
  return absoluteFrames
}

export const resolveAbsoluteTrackValue = <Field extends string>(
  frames: ReadonlyArray<AbsoluteTrackFrame<Field>>,
  position: number,
  key: Field,
) => {
  if (frames.length === 0) {
    return 0
  }

  if (position <= frames[0].position) {
    return frames[0][key]
  }

  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]
    const current = frames[index]
    if (position <= current.position) {
      const span = current.position - previous.position
      if (span <= 0) {
        return current[key]
      }
      const localProgress = (position - previous.position) / span
      return previous[key] + (current[key] - previous[key]) * localProgress
    }
  }

  return frames[frames.length - 1][key]
}

const measureSectionRanges = (
  sectionRefs: SectionRefMap,
  scrollY: number,
  order: readonly LandingSectionName[] = SECTION_ORDER,
): SectionRangeMap => {
  const ranges: SectionRangeMap = {}

  for (const section of order) {
    const element = sectionRefs[section].value
    if (!element) {
      continue
    }

    const rect = element.getBoundingClientRect()
    const start = rect.top + scrollY
    ranges[section] = {
      end: start + rect.height,
      start,
    }
  }

  return ranges
}

const areSectionRangesEqual = (
  left: SectionRangeMap,
  right: SectionRangeMap,
  order: readonly LandingSectionName[] = SECTION_ORDER,
) => {
  for (const section of order) {
    const leftRange = left[section]
    const rightRange = right[section]
    if (!leftRange && !rightRange) {
      continue
    }
    if (!leftRange || !rightRange) {
      return false
    }
    if (leftRange.start !== rightRange.start || leftRange.end !== rightRange.end) {
      return false
    }
  }

  return true
}

export const resolveSectionTrackValue = <Field extends string>(
  tracks: SectionTrackMap<Field>,
  ranges: SectionRangeMap,
  anchorY: number,
  key: Field,
  order: readonly LandingSectionName[] = SECTION_ORDER,
) => {
  const frames = resolveAbsoluteTrackFrames(tracks, ranges, order)
  if (frames.length === 0) {
    return getFirstTrackValue(tracks, key, order)
  }

  return resolveAbsoluteTrackValue(frames, anchorY, key)
}

export const resolveViewportAnchorY = (
  scrollY: number,
  viewportHeight: number,
  anchor = VIEWPORT_SECTION_ANCHOR,
) => scrollY + viewportHeight * anchor

export const resolveSectionProgress = (
  range: { end: number; start: number } | undefined,
  anchorY: number,
) => {
  if (!range) {
    return 0
  }

  const span = range.end - range.start
  if (span <= 0) {
    return anchorY >= range.end ? 1 : 0
  }

  return Math.min(1, (anchorY - range.start) / span)
}

export const resolveFeatureRotation = (degrees: number) => (degrees === 0 ? 0 : -degrees)

const normalizeDegrees = (degrees: number) => {
  const normalized = degrees % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const getCircularDistance = (left: number, right: number) => {
  const delta = Math.abs(normalizeDegrees(left) - normalizeDegrees(right))
  return Math.min(delta, 360 - delta)
}

export const resolveRightmostFeatureIndex = (count: number, rotationDegrees: number) => {
  if (count <= 0) {
    return -1
  }

  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < count; index += 1) {
    const angle = normalizeDegrees((360 / count) * index + rotationDegrees)
    const distance = getCircularDistance(angle, 90)

    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }

  return bestIndex
}

export const resolveFeatureOpacity = (
  index: number,
  count: number,
  rotationDegrees: number,
  inactiveOpacity = 0.5,
) => (index === resolveRightmostFeatureIndex(count, rotationDegrees) ? 1 : inactiveOpacity)

export const resolveOrbitFollowOffsetX = (
  normalizedX: number,
  viewportWidth: number,
  anchorCenterX: number,
) => normalizedX * viewportWidth - anchorCenterX

const useSectionMeasurements = (
  scrollY: MotionValue<number>,
  sectionRefs: SectionRefMap,
): SectionMeasurements => {
  const anchorY = useMotionValue(0)
  const ranges = useMotionValue<SectionRangeMap>({})

  onMount(() => {
    const update = () => {
      const nextScrollY = scrollY.get()
      const nextRanges = measureSectionRanges(sectionRefs, nextScrollY)
      const nextAnchorY = resolveViewportAnchorY(nextScrollY, window.innerHeight)

      if (!areSectionRangesEqual(ranges.get(), nextRanges)) {
        ranges.set(nextRanges)
      }
      if (anchorY.get() !== nextAnchorY) {
        anchorY.set(nextAnchorY)
      }
    }

    update()
    const cleanupScroll = scrollY.on('change', update)
    window.addEventListener('resize', update)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(update)
      for (const section of SECTION_ORDER) {
        const element = sectionRefs[section].value
        if (element) {
          resizeObserver.observe(element)
        }
      }
    }

    onCleanup(() => {
      cleanupScroll()
      window.removeEventListener('resize', update)
      resizeObserver?.disconnect()
    })
  })

  return {
    anchorY,
    ranges,
  }
}

const useSectionTrackValue = <Field extends string>(
  measurements: SectionMeasurements,
  tracks: SectionTrackMap<Field>,
  key: Field,
): MotionValue<number> =>
  useTransform(() =>
    resolveSectionTrackValue(tracks, measurements.ranges.get(), measurements.anchorY.get(), key),
  )

const useSectionProgress = (measurements: SectionMeasurements, section: LandingSectionName) =>
  useTransform(() =>
    resolveSectionProgress(measurements.ranges.get()[section], measurements.anchorY.get()),
  )

const useLandingSectionRefs = (): SectionRefMap => ({
  hero: useSignal<HTMLElement | undefined>(),
  statement: useSignal<HTMLElement | undefined>(),
  features: useSignal<HTMLElement | undefined>(),
  footer: useSignal<HTMLElement | undefined>(),
})

const useFeatureOrbitPresentation = (
  umbrellaX: MotionValue<number>,
  umbrellaRotateY: MotionValue<number>,
) => {
  const orbitAnchorRef = useSignal<HTMLDivElement | undefined>()
  const orbitRef = useSignal<HTMLDivElement | undefined>()

  onMount(() => {
    let anchorCenterX = 0
    let activeFeatureIndex = -1

    const getOrbitItems = () =>
      Array.from(
        orbitRef.value?.querySelectorAll<HTMLDivElement>('.landing-feature-orbit-item') ?? [],
      )

    const syncOrbitX = () => {
      const orbitElement = orbitRef.value
      if (!orbitElement) {
        return
      }

      orbitElement.style.setProperty(
        '--orbit-follow-x',
        `${resolveOrbitFollowOffsetX(umbrellaX.get(), window.innerWidth, anchorCenterX)}px`,
      )
    }

    const syncOrbitRotation = () => {
      const orbitElement = orbitRef.value
      if (!orbitElement) {
        return
      }

      const rotationDegrees = resolveFeatureRotation(umbrellaRotateY.get())
      orbitElement.style.setProperty('--feature-rotation', `${rotationDegrees}deg`)

      const orbitItems = getOrbitItems()
      const nextActiveFeatureIndex = resolveRightmostFeatureIndex(
        orbitItems.length,
        rotationDegrees,
      )
      if (nextActiveFeatureIndex === activeFeatureIndex) {
        return
      }

      if (activeFeatureIndex >= 0) {
        orbitItems[activeFeatureIndex]?.removeAttribute('data-active')
      }
      if (nextActiveFeatureIndex >= 0) {
        orbitItems[nextActiveFeatureIndex]?.setAttribute('data-active', 'true')
      }
      activeFeatureIndex = nextActiveFeatureIndex
    }

    const measureAnchor = () => {
      const anchorElement = orbitAnchorRef.value
      if (!anchorElement) {
        return
      }

      const rect = anchorElement.getBoundingClientRect()
      anchorCenterX = rect.left + rect.width / 2
      syncOrbitX()
    }

    measureAnchor()
    syncOrbitRotation()

    const cleanupX = umbrellaX.on('change', syncOrbitX)
    const cleanupRotate = umbrellaRotateY.on('change', syncOrbitRotation)
    window.addEventListener('resize', measureAnchor)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && orbitAnchorRef.value) {
      resizeObserver = new ResizeObserver(measureAnchor)
      resizeObserver.observe(orbitAnchorRef.value)
    }

    onCleanup(() => {
      cleanupX()
      cleanupRotate()
      window.removeEventListener('resize', measureAnchor)
      resizeObserver?.disconnect()
    })
  })

  return {
    orbitAnchorRef,
    orbitRef,
  }
}

const HeroSection = ({ sectionRef }: { sectionRef: Signal<HTMLElement | undefined> }) => (
  <div
    class="relative pl-5 md:pl-15 z-20 flex justify-center h-[calc(100vh-7rem)] max-h-screen flex-col px-4 pb-20 pt-20"
    id="hero"
    ref={sectionRef}
  >
    <h1 class="uppercase relative z-10 mb-8 mt-15 w-full select-none text-[clamp(3rem,8vw,8rem)] leading-[0.75] tracking-[-0.02em] text-white font-archivo-black">
      <div>
        The{' '}
        <span class="bg-linear-to-r from-[#9d00ff] to-[#7700ff] bg-clip-text text-transparent">
          Final
        </span>
        <span>-Gen</span>
      </div>
      <div>Frontend</div>
      <div>Framework</div>
    </h1>
  </div>
)

const SectionDivider = () => (
  <div
    aria-hidden="true"
    class="relative z-20 mx-0 my-16 h-[2px] w-full bg-[linear-gradient(90deg,transparent,#9d00ff,transparent)] shadow-[0_0_15px_#9d00ff]"
  ></div>
)

const StatementSection = ({
  progress,
  sectionRef,
}: {
  progress: Signal<number>
  sectionRef: Signal<HTMLElement | undefined>
}) => (
  <section class="z-1 px-4 sm:px-6" ref={sectionRef}>
    <div class="line flex flex-col gap-[clamp(1rem,4vw,1.75rem)] text-center font-archivo-black text-[clamp(2.75rem,12vw,8rem)] leading-[0.75] tracking-[-0.03em] font-extrabold">
      <div>
        <motion.span
          animate={progress.value >= -1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          class="bg-linear-to-r from-[#9d00ff] to-[#7700ff] bg-clip-text text-transparent"
        >
          ECLIPSA
        </motion.span>{' '}
        <motion.span
          animate={progress.value >= -0.9 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        >
          IS A
        </motion.span>
      </div>
      <motion.div
        animate={progress.value >= -0.7 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        initial={false}
        transition={{ duration: 0.24 }}
      >
        JAVASCRIPT
      </motion.div>
      <motion.div animate={progress.value >= -0.5 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}>
        FRONTEND
      </motion.div>
      <motion.div animate={progress.value >= -0.3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}>
        FRAMEWORK
      </motion.div>
    </div>
    <motion.div
      animate={progress.value >= -0.1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 16 }}
      class="pt-10 text-center text-[clamp(2rem,9vw,4.5rem)] leading-[0.75] tracking-[-0.03em] font-black text-white"
    >
      with
    </motion.div>
  </section>
)

const SiteFooter = ({ sectionRef }: { sectionRef: Signal<HTMLElement | undefined> }) => (
  <footer
    class="relative z-20 mt-10 border-t border-white/5 py-10 text-center text-sm text-zinc-500"
    id="footer"
    ref={sectionRef}
  >
    <p>&copy; 2025 pnsk-lab MIT License.</p>
  </footer>
)

const CompileOutputFlow = ({ visible }: { visible: Signal<boolean> }) => (
  <div class="landing-compile-flow" data-visible={visible.value ? 'true' : 'false'}>
    <div class="my-5 text-center text-base sm:text-lg">
      eclipsa compiles your code and make it faster.
    </div>
    <motion.div
      animate={visible.value ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
      class="flex w-full gap-4"
      transition={{ delay: 0 }}
    >
      <div class="landing-compile-rail landing-compile-rail-source flex w-7 flex-col">
        <div class="landing-compile-segment landing-compile-segment-horizontal mt-7 h-px w-full" />
        <div class="landing-compile-segment landing-compile-segment-vertical grow w-px" />
        <span class="landing-compile-dot landing-compile-dot-source"></span>
      </div>
      <div class="min-w-0 flex-1 flex flex-col gap-2">
        <div class="text-gray-400">YOUR CODE</div>
        <pre class="rounded-lg border border-purple-950/50 bg-black/30 p-2 text-[clamp(1rem,4vw,1.25rem)]">{`<div>{count.value}</div>`}</pre>
      </div>
    </motion.div>

    <motion.div
      animate={visible.value ? { opacity: 1, x: 0 } : { opacity: 0, x: 16 }}
      class="flex w-full gap-4"
      transition={{ delay: 0.2 }}
    >
      <div class="landing-compile-rail landing-compile-rail-client flex w-7 flex-col">
        <div class="landing-compile-segment landing-compile-segment-vertical h-7 w-px" />
        <div class="landing-compile-segment landing-compile-segment-horizontal h-px w-full" />
        <div class="landing-compile-segment landing-compile-segment-vertical grow w-px" />
        <span class="landing-compile-dot landing-compile-dot-client"></span>
      </div>
      <div class="mt-5 min-w-0 flex-1 flex flex-col gap-2">
        <div class="text-gray-400">Client</div>
        <pre class="bg-black/30 p-2 rounded-lg border border-purple-950/50 text-sm">{`var _cloned = __eclipsaTemplate0();
var __eclipsaNode0 = _cloned.childNodes[0];
_insert(() => count.value, _cloned, __eclipsaNode0);
return _cloned;`}</pre>
      </div>
    </motion.div>

    <motion.div
      animate={visible.value ? { opacity: 1, x: 0 } : { opacity: 0, x: 16 }}
      class="flex w-full gap-4"
      transition={{ delay: 0.4 }}
    >
      <div class="landing-compile-rail landing-compile-rail-ssr flex w-7 flex-col">
        <div class="landing-compile-segment landing-compile-segment-vertical h-7 w-px" />
        <div class="landing-compile-segment landing-compile-segment-horizontal h-px w-full" />
        <span class="landing-compile-dot landing-compile-dot-ssr"></span>
      </div>
      <div class="mt-5 min-w-0 flex-1 flex flex-col gap-2">
        <div class="text-gray-400">SSR</div>
        <pre class="bg-black/30 p-2 rounded-lg border border-purple-950/50 text-sm">{`return _ssrTemplate(["<div>", "</div>"], count.value);`}</pre>
      </div>
    </motion.div>
  </div>
)

export default () => {
  const sectionRefs = useLandingSectionRefs()
  const { scrollY } = useScroll()
  const sectionMeasurements = useSectionMeasurements(scrollY, sectionRefs)
  const statementProgress = useSectionProgress(sectionMeasurements, 'statement')
  const statementProgressSignal = useSignal(0)
  const featuresProgress = useSectionProgress(sectionMeasurements, 'features')
  const featuresVisibleSignal = useSignal(false)
  const compilerVisible = useSignal(false)
  const yourCodeVisible = useSignal(false)

  useMotionValueEvent(statementProgress, 'change', (value) => {
    statementProgressSignal.value = value
  })
  useMotionValueEvent(featuresProgress, 'change', (value) => {
    featuresVisibleSignal.value = value >= 0
    compilerVisible.value = value >= 0.23
    yourCodeVisible.value = value >= 0.24
  })

  const umbrellaOpen = useSpring(useSectionTrackValue(sectionMeasurements, OPEN, 'open'), {
    damping: 28,
    stiffness: 260,
  })
  const umbrellaSize = useSpring(useSectionTrackValue(sectionMeasurements, SIZE, 'size'), {
    damping: 30,
    stiffness: 240,
  })
  const umbrellaX = useSpring(useSectionTrackValue(sectionMeasurements, POS, 'x'), {
    damping: 30,
    stiffness: 240,
  })
  const umbrellaY = useSpring(useSectionTrackValue(sectionMeasurements, POS, 'y'), {
    damping: 30,
    stiffness: 240,
  })
  const umbrellaRotateX = useSpring(useSectionTrackValue(sectionMeasurements, ROTATE, 'x'), {
    damping: 26,
    stiffness: 220,
  })
  const umbrellaRotateY = useSpring(useSectionTrackValue(sectionMeasurements, ROTATE, 'y'), {
    damping: 26,
    stiffness: 220,
  })
  const umbrellaRotateZ = useSpring(useSectionTrackValue(sectionMeasurements, ROTATE, 'z'), {
    damping: 26,
    stiffness: 220,
  })
  const { canvasRef } = useLandingScene({
    motion: {
      open: umbrellaOpen,
      positionNormalized: {
        x: umbrellaX,
        y: umbrellaY,
      },
      rotation: {
        x: umbrellaRotateX,
        y: umbrellaRotateY,
        z: umbrellaRotateZ,
      },
      sizeNormalized: umbrellaSize,
    },
  })
  const { orbitAnchorRef, orbitRef } = useFeatureOrbitPresentation(umbrellaX, umbrellaRotateY)

  return (
    <div class="relative flex min-h-screen flex-col overflow-x-clip bg-[#050505] text-white antialiased font-space-grotesk selection:bg-purple-500 selection:text-white">
      <div
        aria-hidden="true"
        class="pointer-events-none fixed inset-0 z-0 bg-[image:linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:50px_50px]"
      ></div>
      <canvas
        aria-hidden="true"
        class="pointer-events-none fixed inset-0 z-[1] h-screen w-screen"
        ref={canvasRef}
      ></canvas>

      <HeroSection sectionRef={sectionRefs.hero} />
      <SectionDivider />
      <StatementSection sectionRef={sectionRefs.statement} progress={statementProgressSignal} />

      <section class="landing-features-section" id="features" ref={sectionRefs.features}>
        <motion.div class="landing-features-stage">
          <div class="landing-features-orbit-anchor" ref={orbitAnchorRef}>
            <div
              class="landing-features-orbit"
              ref={orbitRef}
              style={`--feature-count:${FEATURE_ITEMS.length}`}
            >
              {FEATURE_ITEMS.map((feature, index) => (
                <div
                  key={feature.title}
                  class="landing-feature-orbit-item"
                  data-active={
                    index === resolveRightmostFeatureIndex(FEATURE_ITEMS.length, 0)
                      ? 'true'
                      : undefined
                  }
                  style={`--feature-index: ${index}`}
                >
                  <article
                    class="landing-feature-card flex items-center gap-1 justify-center self-start rounded-lg transition duration-300 hover:-translate-y-2"
                    data-interactive=""
                  >
                    <div
                      class={`${feature.iconClass} landing-feature-card-icon h-8 w-8 text-[#fbf4ff]`}
                    />
                    <motion.div
                      animate={
                        featuresVisibleSignal.value ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }
                      }
                    >
                      <h2 class="font-archivo-black text-[clamp(0.9rem,2vw,1.5rem)] uppercase tracking-wide text-white">
                        {feature.title}
                      </h2>
                    </motion.div>
                  </article>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
        <div class="landing-features-content text-white">
          <div class="landing-features-content-spacer" />
          <div class="landing-features-stack">
            <motion.div
              class="landing-features-compiler"
              animate={compilerVisible.value ? { opacity: 1 } : { opacity: 0 }}
            >
              <div class="flex min-h-dvh flex-col justify-center">
                <div class="landing-features-compiler-spacer" />
                <div class="landing-features-compiler-headline font-extrabold text-[clamp(2rem,5vw,4.5rem)] text-center leading-none tracking-[-0.02em]">
                  <div>SSR Fast,</div>
                  <div>Client Fast.</div>
                </div>
                <div class="relative mt-8 min-h-[200vh]">
                  <div class="landing-features-compiler-viewport">
                    <CompileOutputFlow visible={yourCodeVisible} />
                  </div>
                </div>
              </div>
            </motion.div>
            <div class="landing-features-copy">
              <div class="text-base sm:text-lg">
                eclipsa is inspired by a lot of modern frameworks, and has a features required for
                modern development:
              </div>
              <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  {
                    icon: 'i-tabler-file-code',
                    title: 'File System Routing',
                    link: '/docs/materials/routing',
                  },
                ].map((feature) => (
                  <div
                    key={feature.title}
                    class="flex flex-col gap-2 mt-4 border border-purple-950/50 rounded-lg p-4"
                  >
                    <div class="flex items-center gap-2">
                      <div class={`${feature.icon} h-6 w-6 text-[#fbf4ff]`} />
                      <div class="text-white text-lg">{feature.title}</div>
                    </div>
                    <Image
                      class="max-h-36 object-contain object-left"
                      src={routingVscodeImage}
                      decoding="auto"
                      width={256}
                      alt={feature.title}
                    />
                    <Link href={feature.link} class="text-sm text-purple-400 hover:underline">
                      Learn more
                    </Link>
                  </div>
                ))}
              </div>
            </div>
            <div class="landing-features-placeholder bg-amber-200">
              {'lorem ipsum dolor sit amet'.repeat(1)}
            </div>
          </div>
        </div>
      </section>
      <SiteFooter sectionRef={sectionRefs.footer} />
    </div>
  )
}
