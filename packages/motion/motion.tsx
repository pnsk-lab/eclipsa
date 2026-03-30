import { createContext, signal, useContext, useSignal, type JSX, type Signal } from 'eclipsa'
import { __eclipsaComponent } from 'eclipsa/internal'
import { MotionValue, type MotionNodeOptions, type PanInfo } from 'motion-dom'
import type { MotionAnimateOptions } from './animate.ts'
import type { DragControls } from './hooks.ts'

type MaybeMotionValue<T> = T | MotionValue<T>
type StyleLike = Record<string, MaybeMotionValue<string | number>> | string | undefined

export interface MotionConfigProps {
  children?: JSX.Element | JSX.Element[]
  reducedMotion?: 'always' | 'never' | 'user'
  transition?: MotionAnimateOptions
}

interface MotionConfigState {
  reducedMotion: 'always' | 'never' | 'user'
  transition: MotionAnimateOptions
}

interface PresenceContextValue {
  hasExit: Signal<boolean>
  isPresent: Signal<boolean>
  safeToRemove: (() => void) | null
}

interface LayoutGroupState {
  id: string
}

interface ReorderGroupContextValue<T> {
  axis: 'x' | 'y'
  onReorder: (values: T[]) => void
  setDraggedValue: (value: T | null) => void
  values: T[]
  draggedValue: Signal<T | null>
}

const asManagedComponent = <T extends object>(name: string, component: (props: T) => JSX.Element) =>
  __eclipsaComponent(component, `@eclipsa/motion:${name}`, () => [])

export type MotionProps = Partial<MotionNodeOptions> & {
  [key: string]: unknown
  as?: string
  children?: JSX.Element | JSX.Element[]
  dragControls?: DragControls
  inViewOptions?: IntersectionObserverInit
  layoutDependency?: unknown
  ref?: Signal<Element | undefined> | { value?: Element | undefined }
  style?: StyleLike
}

const DEFAULT_CONFIG: MotionConfigState = {
  reducedMotion: 'user',
  transition: {
    duration: 0.3,
    ease: 'ease',
  },
}

const EMPTY_PRESENCE: PresenceContextValue = {
  hasExit: signal(false),
  isPresent: signal(true),
  safeToRemove: null,
}

const MotionConfigContext = createContext(DEFAULT_CONFIG)
const LayoutGroupContext = createContext<LayoutGroupState | null>(null)
const PresenceContext = createContext(EMPTY_PRESENCE)
const ReorderGroupContext = createContext<ReorderGroupContextValue<unknown> | null>(null)

const MOTION_PROP_NAMES = new Set([
  'animate',
  'custom',
  'drag',
  'dragConstraints',
  'dragControls',
  'dragDirectionLock',
  'dragElastic',
  'dragListener',
  'dragMomentum',
  'dragSnapToOrigin',
  'dragTransition',
  'exit',
  'inViewOptions',
  'initial',
  'layout',
  'layoutDependency',
  'layoutId',
  'layoutRoot',
  'layoutScroll',
  'onAnimationComplete',
  'onDrag',
  'onDragEnd',
  'onDragStart',
  'onFocusEnd',
  'onFocusStart',
  'onHoverEnd',
  'onHoverStart',
  'onPan',
  'onPanEnd',
  'onPanStart',
  'onTap',
  'onTapCancel',
  'onTapStart',
  'onViewportEnter',
  'onViewportLeave',
  'transformTemplate',
  'transition',
  'variants',
  'whileFocus',
  'whileHover',
  'whileInView',
  'whileTap',
])

const TRANSFORM_PROP_NAMES = [
  'x',
  'y',
  'z',
  'scale',
  'scaleX',
  'scaleY',
  'rotate',
  'rotateX',
  'rotateY',
  'skewX',
  'skewY',
] as const
const UNITLESS_STYLES = new Set(['opacity', 'scale', 'scaleX', 'scaleY', 'scaleZ', 'zIndex'])

const isMotionValue = <T,>(value: unknown): value is MotionValue<T> => value instanceof MotionValue

const resolveValue = (value: MaybeMotionValue<string | number> | undefined) =>
  isMotionValue(value) ? value.get() : value

const toCssPropertyName = (name: string) => {
  if (name.startsWith('--') || name.includes('-')) {
    return name
  }
  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
}

const toUnitValue = (name: string, value: string | number | undefined) => {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'number') {
    return String(value)
  }
  if (UNITLESS_STYLES.has(name) || name.startsWith('--')) {
    return String(value)
  }
  if (name.startsWith('rotate') || name.startsWith('skew')) {
    return `${value}deg`
  }
  return `${value}px`
}

const buildTransformString = (target: Record<string, string | number | undefined>) => {
  const parts: string[] = []
  if (target.x !== undefined || target.y !== undefined || target.z !== undefined) {
    const x = toUnitValue('x', target.x) ?? '0px'
    const y = toUnitValue('y', target.y) ?? '0px'
    const z = toUnitValue('z', target.z) ?? '0px'
    parts.push(`translate3d(${x}, ${y}, ${z})`)
  }
  for (const name of TRANSFORM_PROP_NAMES) {
    if (name === 'x' || name === 'y' || name === 'z') {
      continue
    }
    const value = target[name]
    if (value === undefined) {
      continue
    }
    parts.push(`${name}(${toUnitValue(name, value)})`)
  }
  return parts.join(' ')
}

const mergeTargets = (...targets: Array<Record<string, unknown> | null | undefined>) =>
  targets.reduce<Record<string, unknown>>((result, target) => {
    if (!target) {
      return result
    }
    for (const [key, value] of Object.entries(target)) {
      if (value !== undefined && key !== 'transition' && key !== 'transitionEnd') {
        result[key] = value
      }
    }
    return result
  }, {})

const resolveVariant = (value: unknown, props: MotionProps): Record<string, unknown> | null => {
  if (!value || value === true || value === false) {
    return null
  }
  if (Array.isArray(value)) {
    return mergeTargets(...value.map((entry) => resolveVariant(entry, props)))
  }
  if (typeof value === 'string') {
    const variants = (props.variants ?? null) as Record<string, unknown> | null
    return variants && typeof variants === 'object'
      ? (resolveVariant(variants[value], props) ?? {})
      : null
  }
  if (typeof value === 'function') {
    return resolveVariant(value(props.custom, {}, {}), props)
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : null
}

const createStyleTarget = (target: Record<string, unknown> | null): Record<string, string> => {
  const styleTarget: Record<string, string | number | undefined> = {}
  if (!target) {
    target = {}
  }
  for (const [key, rawValue] of Object.entries(target)) {
    const value = resolveValue(rawValue as MaybeMotionValue<string | number>)
    if (
      value === undefined ||
      key === 'transition' ||
      key === 'transitionEnd' ||
      (typeof value !== 'string' && typeof value !== 'number')
    ) {
      continue
    }
    styleTarget[key] = value
  }
  const transform = buildTransformString(styleTarget)
  const styleObject: Record<string, string> = {}
  for (const [key, value] of Object.entries(styleTarget)) {
    if ((TRANSFORM_PROP_NAMES as readonly string[]).includes(key)) {
      continue
    }
    if (value !== undefined) {
      styleObject[key] = toUnitValue(key, value) ?? ''
    }
  }
  if (transform) {
    styleObject.transform = transform
  }
  if (target.transitionEnd && typeof target.transitionEnd === 'object') {
    for (const [key, value] of Object.entries(target.transitionEnd as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'number') {
        styleObject[key] = toUnitValue(key, value) ?? ''
      }
    }
  }
  return styleObject
}

const parseStyle = (style: StyleLike): Record<string, string> => {
  if (!style) {
    return {}
  }
  if (typeof style === 'string') {
    const result: Record<string, string> = {}
    for (const part of style.split(';')) {
      const [rawName, rawValue] = part.split(':')
      const name = rawName?.trim()
      const value = rawValue?.trim()
      if (name && value) {
        result[name] = value
      }
    }
    return result
  }
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(style)) {
    const resolved = resolveValue(value)
    if (resolved !== undefined && (typeof resolved === 'string' || typeof resolved === 'number')) {
      result[toCssPropertyName(key)] = toUnitValue(key, resolved) ?? ''
    }
  }
  return result
}

const serializeStyle = (style: Record<string, string>) =>
  Object.entries(style)
    .filter(([, value]) => value !== '')
    .map(([name, value]) => `${toCssPropertyName(name)}: ${value}`)
    .join('; ')

const toCssEasing = (value: MotionAnimateOptions['ease']) => {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value) && value.length === 4) {
    return `cubic-bezier(${value.join(',')})`
  }
  return 'ease'
}

const createTransitionCss = (
  target: Record<string, string>,
  transition: MotionAnimateOptions,
): Record<string, string> =>
  Object.keys(target).length === 0
    ? {}
    : {
        'transition-delay': `${transition.delay ?? 0}s`,
        'transition-duration': `${transition.duration ?? 0.3}s`,
        'transition-property': Object.keys(target).map(toCssPropertyName).join(', '),
        'transition-timing-function': toCssEasing(transition.ease),
      }

const resolveTransition = (props: MotionProps, config: MotionConfigState): MotionAnimateOptions => {
  const own = props.transition
  if (own && typeof own === 'object') {
    const transition = own as Record<string, unknown>
    return {
      ...config.transition,
      delay: typeof transition.delay === 'number' ? transition.delay : config.transition.delay,
      duration:
        typeof transition.duration === 'number' ? transition.duration : config.transition.duration,
      ease:
        typeof transition.ease === 'string' || Array.isArray(transition.ease)
          ? (transition.ease as MotionAnimateOptions['ease'])
          : config.transition.ease,
      onComplete: props.onAnimationComplete as (() => void) | undefined,
    }
  }
  return {
    ...config.transition,
    onComplete: props.onAnimationComplete as (() => void) | undefined,
  }
}

export const MotionConfig = asManagedComponent<MotionConfigProps>(
  'MotionConfig',
  ({ children, reducedMotion, transition }) => (
    <MotionConfigContext.Provider
      value={{
        reducedMotion: reducedMotion ?? DEFAULT_CONFIG.reducedMotion,
        transition: {
          ...DEFAULT_CONFIG.transition,
          ...transition,
        },
      }}
    >
      {children}
    </MotionConfigContext.Provider>
  ),
)

export const LayoutGroup = asManagedComponent<{
  children?: JSX.Element | JSX.Element[]
  id?: string
}>('LayoutGroup', ({ children, id }) => (
  <LayoutGroupContext.Provider
    value={{
      id: id ?? 'default',
    }}
  >
    {children}
  </LayoutGroupContext.Provider>
))

export const usePresence = () => {
  const presence = useContext(PresenceContext)
  return [presence.isPresent.value, presence.safeToRemove ?? (() => {})] as const
}

export const useIsPresent = () => useContext(PresenceContext).isPresent.value

export const AnimatePresence = asManagedComponent<{
  children?: JSX.Element | JSX.Element[]
}>('AnimatePresence', ({ children }) => children as JSX.Element)

const createMotionRenderer = (defaultTag: string) => (rawProps: MotionProps) => {
  const motionProps = rawProps ?? {}
  const baseTag = typeof motionProps.as === 'string' ? motionProps.as : defaultTag
  const resolveAnimateTarget = () =>
    createStyleTarget(resolveVariant(motionProps.animate, motionProps))
  const resolveInitialTarget = () =>
    motionProps.initial === false
      ? resolveAnimateTarget()
      : createStyleTarget(resolveVariant(motionProps.initial ?? motionProps.animate, motionProps))

  const forwardedProps: Record<string, unknown> = {}
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(motionProps))) {
    if (MOTION_PROP_NAMES.has(key) || key === 'as' || key === 'style' || key === 'ref') {
      continue
    }
    Object.defineProperty(forwardedProps, key, descriptor)
  }

  const animateTarget = resolveAnimateTarget()
  const renderInitialStyle = motionProps.initial === false ? animateTarget : resolveInitialTarget()
  const resolvedStyle = typeof document !== 'undefined' ? animateTarget : renderInitialStyle
  const mergedStyle = serializeStyle({
    ...parseStyle(motionProps.style),
    ...resolvedStyle,
    ...createTransitionCss(animateTarget, resolveTransition(motionProps, DEFAULT_CONFIG)),
  })
  if (motionProps.ref !== undefined) {
    forwardedProps.ref = motionProps.ref
  }
  if (mergedStyle !== '') {
    forwardedProps.style = mergedStyle
  }

  return {
    isStatic: false,
    props: {
      ...forwardedProps,
      children: motionProps.children,
    },
    type: baseTag,
  } as JSX.Element
}

type MotionFactory = {
  <T extends string>(tag: T): (props: MotionProps) => JSX.Element
  create<T extends string>(tag: T): (props: MotionProps) => JSX.Element
  [key: string]: any
}

const motionFactory = ((tag: string) => createMotionRenderer(tag)) as MotionFactory
motionFactory.create = (tag: string) => createMotionRenderer(tag)

export const motion = new Proxy(motionFactory, {
  get(target, prop, receiver) {
    if (prop in target) {
      return Reflect.get(target, prop, receiver)
    }
    return createMotionRenderer(String(prop))
  },
}) as MotionFactory

export const m = motion

export const Reorder = {
  Group: asManagedComponent<{
    axis?: 'x' | 'y'
    children?: JSX.Element | JSX.Element[]
    onReorder: (values: unknown[]) => void
    values: unknown[]
  }>('Reorder.Group', ({ axis, children, onReorder, values }) => {
    const draggedValue = useSignal<unknown | null>(null)
    return (
      <ReorderGroupContext.Provider
        value={
          {
            axis: axis ?? 'y',
            draggedValue,
            onReorder,
            setDraggedValue: (value) => {
              draggedValue.value = value
            },
            values,
          } as ReorderGroupContextValue<unknown>
        }
      >
        {children}
      </ReorderGroupContext.Provider>
    )
  }),
  Item: asManagedComponent<MotionProps & { value: unknown }>('Reorder.Item', (rawProps) => {
    const itemProps = rawProps ?? {}
    const { as: asValue, onDragStart, value } = itemProps
    const group = useContext(ReorderGroupContext)

    const handleDragStart = (event: DragEvent) => {
      group?.setDraggedValue(value)
      onDragStart?.(event, {
        delta: { x: 0, y: 0 },
        offset: { x: 0, y: 0 },
        point: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
      } satisfies PanInfo)
    }

    const handleDrop = (event: DragEvent) => {
      event.preventDefault()
      if (!group || group.draggedValue.value === null || group.draggedValue.value === value) {
        return
      }
      const next = [...group.values]
      const from = next.indexOf(group.draggedValue.value)
      const to = next.indexOf(value)
      if (from < 0 || to < 0) {
        return
      }
      const [movedValue] = next.splice(from, 1)
      next.splice(to, 0, movedValue)
      group.onReorder(next)
      group.setDraggedValue(null)
    }

    const renderer = createMotionRenderer(typeof asValue === 'string' ? asValue : 'div')
    return renderer({
      ...itemProps,
      draggable: true,
      onDragOver: (event: DragEvent) => event.preventDefault(),
      onDragStart: handleDragStart,
      onDrop: handleDrop,
    })
  }),
}

export { LayoutGroupContext, MotionConfigContext, PresenceContext }
