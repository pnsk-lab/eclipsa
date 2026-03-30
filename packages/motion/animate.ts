import { easeIn, easeInOut, easeOut, type Easing } from 'motion-utils'
import {
  MotionValue,
  isMotionValue,
  stagger as staggerValue,
  delay as delayValue,
  spring,
} from 'motion-dom'

export type MotionAnimationTarget =
  | Element
  | Element[]
  | NodeListOf<Element>
  | MotionValue<number>
  | string
  | null
  | undefined

export type MotionKeyframes = Record<string, string | number>

export interface MotionAnimateOptions {
  delay?: number
  duration?: number
  ease?: Easing | string
  onComplete?: () => void
}

export interface MotionAnimationControls {
  cancel(): void
  complete(): void
  finished: Promise<void>
  pause(): void
  play(): void
  stop(): void
}

const WAAPI_EASING = {
  easeIn,
  easeInOut,
  easeOut,
}

const isBrowser = () => typeof document !== 'undefined' && typeof window !== 'undefined'

const isElement = (value: unknown): value is Element =>
  !!value && typeof value === 'object' && 'nodeType' in value

const resolveElements = (target: MotionAnimationTarget, scope?: Element | null): Element[] => {
  if (!target) {
    return []
  }
  if (typeof target === 'string') {
    const root = scope ?? (isBrowser() ? document : null)
    return root ? [...root.querySelectorAll(target)] : []
  }
  if (isElement(target)) {
    return [target]
  }
  if (target instanceof MotionValue) {
    return []
  }
  if (typeof NodeList !== 'undefined' && target instanceof NodeList) {
    return [...target]
  }
  return Array.isArray(target) ? target.filter(isElement) : []
}

const toCssValue = (name: string, value: string | number) => {
  if (typeof value !== 'number') {
    return String(value)
  }
  if (
    name === 'opacity' ||
    name === 'scale' ||
    name === 'scaleX' ||
    name === 'scaleY' ||
    name === 'scaleZ' ||
    name === 'zIndex' ||
    name.startsWith('--')
  ) {
    return String(value)
  }
  return `${value}px`
}

const resolveEasing = (ease: MotionAnimateOptions['ease']) => {
  if (typeof ease === 'string') {
    return ease in WAAPI_EASING ? ease : ease
  }
  if (
    Array.isArray(ease) &&
    ease.length === 4 &&
    ease.every((entry) => typeof entry === 'number')
  ) {
    return `cubic-bezier(${ease.join(',')})`
  }
  if (typeof ease === 'function') {
    return 'ease'
  }
  return 'ease'
}

const createNoopControls = (onComplete?: () => void): MotionAnimationControls => {
  const finished = Promise.resolve().then(() => {
    onComplete?.()
  })
  return {
    cancel() {},
    complete() {
      onComplete?.()
    },
    finished,
    pause() {},
    play() {},
    stop() {},
  }
}

const createMotionValueControls = (
  value: MotionValue<number>,
  keyframes: string | number,
  options?: MotionAnimateOptions,
): MotionAnimationControls => {
  if (typeof keyframes !== 'number') {
    value.set(Number.parseFloat(String(keyframes)) || 0)
    return createNoopControls(options?.onComplete)
  }
  const from = value.get()
  const to = keyframes
  const durationMs = Math.max(1, (options?.duration ?? 0.3) * 1000)
  const startTime = Date.now()
  let cancelled = false
  let frameId = 0

  const finished = new Promise<void>((resolve) => {
    const step = () => {
      if (cancelled) {
        resolve()
        return
      }
      const elapsed = Date.now() - startTime
      const progress = Math.min(1, elapsed / durationMs)
      value.set(from + (to - from) * progress)
      if (progress >= 1) {
        options?.onComplete?.()
        resolve()
        return
      }
      frameId = requestAnimationFrame(step)
    }
    frameId = requestAnimationFrame(step)
  })

  return {
    cancel() {
      cancelled = true
      cancelAnimationFrame(frameId)
    },
    complete() {
      value.set(to)
      options?.onComplete?.()
    },
    finished,
    pause() {},
    play() {},
    stop() {
      cancelled = true
      cancelAnimationFrame(frameId)
    },
  }
}

const createElementControls = (
  elements: Element[],
  keyframes: MotionKeyframes,
  options?: MotionAnimateOptions,
): MotionAnimationControls => {
  if (
    elements.length === 0 ||
    !elements.every((element) => typeof element.animate === 'function')
  ) {
    for (const element of elements) {
      const typed = element as HTMLElement | SVGElement
      for (const [name, value] of Object.entries(keyframes)) {
        if (name.startsWith('--') && 'style' in typed) {
          typed.style.setProperty(name, String(value))
          continue
        }
        ;(typed as HTMLElement).style.setProperty(name, toCssValue(name, value))
      }
    }
    return createNoopControls(options?.onComplete)
  }

  const animations = elements.map((element) => {
    const computed =
      typeof getComputedStyle === 'function'
        ? getComputedStyle(element as Element)
        : (null as CSSStyleDeclaration | null)
    const fromFrame: Record<string, string> = {}
    const toFrame: Record<string, string> = {}
    for (const [name, value] of Object.entries(keyframes)) {
      const resolved = toCssValue(name, value)
      fromFrame[name] =
        computed?.getPropertyValue(name) || (element as HTMLElement).style.getPropertyValue(name)
      toFrame[name] = resolved
    }
    return element.animate([fromFrame, toFrame], {
      delay: (options?.delay ?? 0) * 1000,
      duration: (options?.duration ?? 0.3) * 1000,
      easing: resolveEasing(options?.ease),
      fill: 'forwards',
    })
  })

  const finished = Promise.all(
    animations.map((animation) => animation.finished.catch(() => undefined)),
  ).then(() => {
    options?.onComplete?.()
  })

  return {
    cancel() {
      for (const animation of animations) {
        animation.cancel()
      }
    },
    complete() {
      for (const animation of animations) {
        animation.finish()
      }
    },
    finished,
    pause() {
      for (const animation of animations) {
        animation.pause()
      }
    },
    play() {
      for (const animation of animations) {
        animation.play()
      }
    },
    stop() {
      for (const animation of animations) {
        animation.cancel()
      }
    },
  }
}

export const animate = (
  target: MotionAnimationTarget,
  keyframes: MotionKeyframes | string | number,
  options?: MotionAnimateOptions,
): MotionAnimationControls => {
  if (isMotionValue(target)) {
    return createMotionValueControls(
      target as MotionValue<number>,
      keyframes as string | number,
      options,
    )
  }
  const elements = resolveElements(target)
  if (!isBrowser()) {
    return createNoopControls(options?.onComplete)
  }
  if (typeof keyframes !== 'object' || !keyframes) {
    return createNoopControls(options?.onComplete)
  }
  return createElementControls(elements, keyframes, options)
}

export const createScopedAnimate =
  (scope: Element | null | undefined) =>
  (
    target: MotionAnimationTarget,
    keyframes: MotionKeyframes | string | number,
    options?: MotionAnimateOptions,
  ) =>
    typeof target === 'string'
      ? createElementControls(
          resolveElements(target, scope ?? null),
          keyframes as MotionKeyframes,
          options,
        )
      : animate(target, keyframes, options)

export { delayValue as delay, spring, staggerValue as stagger }
