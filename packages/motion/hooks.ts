import { onMount, onCleanup, useSignal, type Signal } from 'eclipsa'
import {
  MotionValue,
  mapValue,
  motionValue,
  springValue,
  time,
  transformValue,
  type TransformOptions,
} from 'motion-dom'
import { createScopedAnimate } from './animate.ts'

export interface DragControls {
  start(event: PointerEvent | MouseEvent | TouchEvent): void
  subscribe(start: (event: PointerEvent | MouseEvent | TouchEvent) => void): () => void
}

export const useMotionValue = <T>(initial: T) => motionValue(initial)

export function useTransform<O>(transform: () => O): MotionValue<O>
export function useTransform<O>(
  inputValue: MotionValue<number>,
  inputRange: number[],
  outputRange: O[],
  options?: TransformOptions<O>,
): MotionValue<O>
export function useTransform<O>(
  inputOrTransform: MotionValue<number> | (() => O),
  inputRange?: number[],
  outputRange?: O[],
  options?: TransformOptions<O>,
): MotionValue<O> {
  if (typeof inputOrTransform === 'function') {
    return transformValue(inputOrTransform)
  }
  return mapValue(inputOrTransform, inputRange ?? [0, 1], outputRange ?? ([] as O[]), options)
}

export const useSpring = <T extends string | number>(
  source: T | MotionValue<T>,
  options?: Parameters<typeof springValue>[1],
) => springValue(source, options)

export const useVelocity = (value: MotionValue<number>) => transformValue(() => value.getVelocity())

export const useMotionTemplate = (
  strings: TemplateStringsArray,
  ...values: Array<string | number | MotionValue<string | number>>
) =>
  transformValue(() =>
    strings.reduce((result, segment, index) => {
      const value = values[index]
      if (value === undefined) {
        return result + segment
      }
      return result + segment + (value instanceof MotionValue ? String(value.get()) : String(value))
    }, ''),
  )

export const useTime = () => {
  const value = motionValue(time.now())
  onMount(() => {
    let frameId = 0
    const tick = () => {
      value.set(time.now())
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    onCleanup(() => cancelAnimationFrame(frameId))
  })
  return value
}

export const useAnimationFrame = (callback: (time: number, delta: number) => void) => {
  onMount(() => {
    let frameId = 0
    let previous = time.now()
    const tick = () => {
      const current = time.now()
      callback(current, current - previous)
      previous = current
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    onCleanup(() => cancelAnimationFrame(frameId))
  })
}

export const useMotionValueEvent = <T, EventName extends Parameters<MotionValue<T>['on']>[0]>(
  value: MotionValue<T>,
  eventName: EventName,
  callback: Parameters<MotionValue<T>['on']>[1],
) => {
  onMount(() => {
    const cleanup = value.on(eventName, callback as never)
    onCleanup(cleanup)
  })
}

export const useReducedMotion = (): Signal<boolean> => {
  const reduced = useSignal(false)
  onMount(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      reduced.value = media.matches
    }
    update()
    media.addEventListener?.('change', update)
    onCleanup(() => media.removeEventListener?.('change', update))
  })
  return reduced
}

type TargetSignal = Signal<Element | undefined> | Element | null | undefined

const resolveTargetElement = (target: TargetSignal) =>
  target && typeof target === 'object' && 'value' in target
    ? (target.value as Element | undefined)
    : (target ?? undefined)

export const useInView = (
  target: TargetSignal,
  options?: IntersectionObserverInit,
): Signal<boolean> => {
  const inView = useSignal(false)
  onMount(() => {
    const element = resolveTargetElement(target)
    if (!element || typeof IntersectionObserver === 'undefined') {
      inView.value = !!element
      return
    }
    const observer = new IntersectionObserver((entries) => {
      inView.value = !!entries[0]?.isIntersecting
    }, options)
    observer.observe(element)
    onCleanup(() => observer.disconnect())
  })
  return inView
}

export const useScroll = (options?: {
  container?: TargetSignal | Window
}): {
  scrollX: MotionValue<number>
  scrollXProgress: MotionValue<number>
  scrollY: MotionValue<number>
  scrollYProgress: MotionValue<number>
} => {
  const scrollX = motionValue(0)
  const scrollY = motionValue(0)
  const scrollXProgress = motionValue(0)
  const scrollYProgress = motionValue(0)

  onMount(() => {
    const resolved = options?.container
    const target =
      resolved && typeof resolved === 'object' && 'value' in resolved
        ? resolved.value
        : (resolved ?? window)
    if (!target) {
      return
    }
    const update = () => {
      const element = target instanceof Window ? target.document.documentElement : target
      const x = target instanceof Window ? target.scrollX : target.scrollLeft
      const y = target instanceof Window ? target.scrollY : target.scrollTop
      const maxX = Math.max(
        0,
        (element.scrollWidth || 0) -
          (target instanceof Window ? target.innerWidth : target.clientWidth),
      )
      const maxY = Math.max(
        0,
        (element.scrollHeight || 0) -
          (target instanceof Window ? target.innerHeight : target.clientHeight),
      )
      scrollX.set(x)
      scrollY.set(y)
      scrollXProgress.set(maxX === 0 ? 0 : x / maxX)
      scrollYProgress.set(maxY === 0 ? 0 : y / maxY)
    }
    update()
    target.addEventListener('scroll', update, { passive: true })
    if (target instanceof Window) {
      target.addEventListener('resize', update)
    }
    onCleanup(() => {
      target.removeEventListener('scroll', update)
      if (target instanceof Window) {
        target.removeEventListener('resize', update)
      }
    })
  })

  return {
    scrollX,
    scrollXProgress,
    scrollY,
    scrollYProgress,
  }
}

export const useAnimate = (): [
  Signal<Element | undefined>,
  ReturnType<typeof createScopedAnimate>,
] => {
  const scope = useSignal<Element | undefined>(undefined)
  return [
    scope,
    (target, keyframes, options) => createScopedAnimate(scope.value)(target, keyframes, options),
  ]
}

export const useDragControls = (): DragControls => {
  const listeners = new Set<(event: PointerEvent | MouseEvent | TouchEvent) => void>()
  return {
    start(event) {
      for (const listener of listeners) {
        listener(event)
      }
    },
    subscribe(start) {
      listeners.add(start)
      return () => {
        listeners.delete(start)
      }
    },
  }
}
