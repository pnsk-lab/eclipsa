import { noSerialize, onCleanup, onMount, type NoSerialize, type Signal, useSignal } from 'eclipsa'
import {
  setupLandingScene,
  type LandingSceneController,
  type NormalizedShieldPoint,
  type ShieldPoint,
  type UmbrellaRotation,
} from './landing-scene.ts'

export interface UseLandingSceneResult {
  canvasRef: Signal<HTMLCanvasElement | undefined>
  setSize: (size: number | null) => void
  setSizeNormalized: (size: number | null) => void
  setUmbrellaAngle: (degrees: number) => void
  setUmbrellaRotation: (rotation: Partial<UmbrellaRotation>) => void
  setUmbrellaOpen: (val: number) => void
  setUmbrellaPosition: (position: ShieldPoint | null) => void
  setUmbrellaPositionNormalized: (position: NormalizedShieldPoint | null) => void
}

const subscribeNumberMotionValue = (
  motionValue:
    | {
        get: () => number
        on: (eventName: 'change', listener: (value: number) => void) => () => void
      }
    | {
        get: () => number | null
        on: (eventName: 'change', listener: (value: number | null) => void) => () => void
      }
    | undefined,
  apply: (value: number | null) => void,
) => {
  if (!motionValue) {
    return
  }

  apply(motionValue.get())
  const cleanup = motionValue.on('change', apply)
  onCleanup(cleanup)
}

export const useLandingScene = (options?: {
  motion?: {
    open?: {
      get: () => number
      on: (eventName: 'change', listener: (value: number) => void) => () => void
    }
    sizeNormalized?: {
      get: () => number | null
      on: (eventName: 'change', listener: (value: number | null) => void) => () => void
    }
    position?: {
      x: {
        get: () => number
        on: (eventName: 'change', listener: (value: number) => void) => () => void
      }
      y: {
        get: () => number
        on: (eventName: 'change', listener: (value: number) => void) => () => void
      }
    }
    positionNormalized?: {
      x: {
        get: () => number
        on: (eventName: 'change', listener: (value: number) => void) => () => void
      }
      y: {
        get: () => number
        on: (eventName: 'change', listener: (value: number) => void) => () => void
      }
    }
    rotation?: {
      x?: {
        get: () => number
        on: (eventName: 'change', listener: (value: number) => void) => () => void
      }
      y?: {
        get: () => number
        on: (eventName: 'change', listener: (value: number) => void) => () => void
      }
      z?: {
        get: () => number
        on: (eventName: 'change', listener: (value: number) => void) => () => void
      }
    }
    size?: {
      get: () => number | null
      on: (eventName: 'change', listener: (value: number | null) => void) => () => void
    }
  }
}): UseLandingSceneResult => {
  const canvasRef = useSignal<HTMLCanvasElement | undefined>()
  const landingScene = useSignal<NoSerialize<LandingSceneController> | null>(null)

  const setSize = (size: number | null) => {
    landingScene.value?.setSize(size)
  }

  const setSizeNormalized = (size: number | null) => {
    landingScene.value?.setSizeNormalized(size)
  }

  const setUmbrellaAngle = (degrees: number) => {
    landingScene.value?.setUmbrellaAngle(degrees)
  }

  const setUmbrellaRotation = (rotation: Partial<UmbrellaRotation>) => {
    landingScene.value?.setUmbrellaRotation(rotation)
  }

  const setUmbrellaOpen = (val: number) => {
    landingScene.value?.setUmbrellaOpen(val)
  }

  const setUmbrellaPosition = (position: ShieldPoint | null) => {
    landingScene.value?.setUmbrellaPosition(position)
  }

  const setUmbrellaPositionNormalized = (position: NormalizedShieldPoint | null) => {
    landingScene.value?.setUmbrellaPositionNormalized(position)
  }

  onMount(() => {
    const canvas = canvasRef.value

    if (!canvas) {
      return
    }

    landingScene.value = noSerialize(setupLandingScene({ canvas }))

    subscribeNumberMotionValue(options?.motion?.size, (value) => {
      landingScene.value?.setSize(value)
    })
    subscribeNumberMotionValue(options?.motion?.sizeNormalized, (value) => {
      landingScene.value?.setSizeNormalized(value)
    })
    subscribeNumberMotionValue(options?.motion?.open, (value) => {
      if (typeof value === 'number') {
        landingScene.value?.setUmbrellaOpen(value)
      }
    })

    const position = options?.motion?.position
    if (position) {
      const applyPosition = () => {
        landingScene.value?.setUmbrellaPosition({
          x: position.x.get(),
          y: position.y.get(),
        })
      }

      applyPosition()
      const cleanupX = position.x.on('change', applyPosition)
      const cleanupY = position.y.on('change', applyPosition)
      onCleanup(() => {
        cleanupX()
        cleanupY()
      })
    }

    const positionNormalized = options?.motion?.positionNormalized
    if (positionNormalized) {
      const applyPositionNormalized = () => {
        landingScene.value?.setUmbrellaPositionNormalized({
          x: positionNormalized.x.get(),
          y: positionNormalized.y.get(),
        })
      }

      applyPositionNormalized()
      const cleanupX = positionNormalized.x.on('change', applyPositionNormalized)
      const cleanupY = positionNormalized.y.on('change', applyPositionNormalized)
      onCleanup(() => {
        cleanupX()
        cleanupY()
      })
    }

    const rotation = options?.motion?.rotation
    if (rotation) {
      const applyRotation = () => {
        const nextRotation: Partial<UmbrellaRotation> = {}
        if (rotation.x) {
          nextRotation.x = rotation.x.get()
        }
        if (rotation.y) {
          nextRotation.y = rotation.y.get()
        }
        if (rotation.z) {
          nextRotation.z = rotation.z.get()
        }
        landingScene.value?.setUmbrellaRotation(nextRotation)
      }

      applyRotation()
      const cleanups: Array<() => void> = []
      for (const value of [rotation.x, rotation.y, rotation.z]) {
        if (value) {
          cleanups.push(value.on('change', applyRotation))
        }
      }
      onCleanup(() => {
        for (const cleanup of cleanups) {
          cleanup()
        }
      })
    }

    onCleanup(() => {
      landingScene.value?.cleanup()
      landingScene.value = null
    })
  })

  return {
    canvasRef,
    setSize,
    setSizeNormalized,
    setUmbrellaAngle,
    setUmbrellaRotation,
    setUmbrellaOpen,
    setUmbrellaPosition,
    setUmbrellaPositionNormalized,
  }
}
