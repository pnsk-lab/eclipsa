import {
  AmbientLight,
  AnimationAction,
  AnimationMixer,
  Box3,
  CanvasTexture,
  Clock,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  LoopOnce,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import {
  getRainShieldCollision,
  getUmbrellaRainShield,
  type RainShield,
} from './landing-scene-shields.ts'

const DROP_ALPHA_MIN = 0.1
const DROP_ALPHA_RANGE = 0.4
const DROP_LENGTH_MIN = 20
const DROP_LENGTH_RANGE = 20
const DROP_LINE_WIDTH = 2
const DROP_RESET_Y_RANGE = 100
const DROP_SPEED_MIN = 10
const DROP_SPEED_RANGE = 15
const DROP_VX_DAMPING = 0.95
const DROP_Z_MIN = 0.5
const DROP_Z_RANGE = 0.5
const MOBILE_BREAKPOINT = 768
const MOBILE_DROP_COUNT = 50
const DESKTOP_DROP_COUNT = 150
const MODEL_CAMERA_DISTANCE_MULTIPLIER = 1.45
const MODEL_ROTATION_SPEED = 0.006
const PASSIVE_EVENT_OPTIONS: AddEventListenerOptions = { passive: true }
const RAIN_COLOR_RGB = '157, 0, 255'
const SHIELD_RADIUS = 100
const SHIELD_REPEL_X_FORCE = 20
const SHIELD_REPEL_Y_FORCE = 0.8

interface ModelViewport {
  side: number
  x: number
  y: number
}

interface ViewportSize {
  height: number
  width: number
}

export interface RainDropState {
  alpha: number
  len: number
  speed: number
  vx: number
  x: number
  y: number
  z: number
}

export interface ShieldPoint {
  x: number
  y: number
}

export interface NormalizedShieldPoint {
  x: number
  y: number
}

export interface UmbrellaRotation {
  x: number
  y: number
  z: number
}

export const MODEL_ROTATION_OFFSET: UmbrellaRotation = {
  x: 90,
  y: 0,
  z: 0,
}

export interface LandingElements {
  canvas: HTMLCanvasElement
}

export interface LandingSceneController {
  cleanup: () => void
  setSize: (size: number | null) => void
  setSizeNormalized: (size: number | null) => void
  setUmbrellaAngle: (degrees: number) => void
  setUmbrellaRotation: (rotation: Partial<UmbrellaRotation>) => void
  setUmbrellaOpen: (val: number) => void
  setUmbrellaPosition: (position: ShieldPoint | null) => void
  setUmbrellaPositionNormalized: (position: NormalizedShieldPoint | null) => void
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

export const resolveUmbrellaRotation = (
  rotation: UmbrellaRotation,
  offset: UmbrellaRotation = MODEL_ROTATION_OFFSET,
): UmbrellaRotation => ({
  x: rotation.x + offset.x,
  y: rotation.y + offset.y,
  z: rotation.z + offset.z,
})

const getDefaultUmbrellaPosition = (width: number, height: number, side: number): ShieldPoint => ({
  x: width - side / 2,
  y: height - side / 2,
})

export const getRainDropCount = (width: number) =>
  width < MOBILE_BREAKPOINT ? MOBILE_DROP_COUNT : DESKTOP_DROP_COUNT

const scaleRainDropCoordinate = (value: number, previousSize: number, nextSize: number) => {
  if (!(nextSize > 0) || !Number.isFinite(nextSize)) {
    return 0
  }

  if (!(previousSize > 0) || !Number.isFinite(previousSize)) {
    return value
  }

  return (value / previousSize) * nextSize
}

export const resizeRainDropStates = (
  drops: RainDropState[],
  previousViewport: ViewportSize,
  nextViewport: ViewportSize,
) =>
  drops.map((drop) => ({
    ...drop,
    x: scaleRainDropCoordinate(drop.x, previousViewport.width, nextViewport.width),
    y: scaleRainDropCoordinate(drop.y, previousViewport.height, nextViewport.height),
  }))

const resolveUmbrellaPosition = (
  width: number,
  height: number,
  position: ShieldPoint | null,
  normalizedPosition: NormalizedShieldPoint | null,
): ShieldPoint | null => {
  if (normalizedPosition) {
    return {
      x: width * normalizedPosition.x,
      y: height * normalizedPosition.y,
    }
  }

  return position
}

export const resolveUmbrellaSize = (
  width: number,
  height: number,
  size: number | null,
  normalizedSize: number | null,
) => {
  if (typeof normalizedSize === 'number' && Number.isFinite(normalizedSize) && normalizedSize > 0) {
    return Math.max(width, height) * normalizedSize
  }

  return size
}

const getModelViewport = (
  width: number,
  height: number,
  umbrellaPosition: ShieldPoint | null,
  size: number | null,
): ModelViewport => {
  const side =
    size && Number.isFinite(size) && size > 0
      ? size
      : width >= 1024
        ? 420
        : width >= 768
          ? 360
          : width >= 640
            ? 280
            : 220
  const centeredPosition = umbrellaPosition ?? getDefaultUmbrellaPosition(width, height, side)
  const left = centeredPosition.x - side / 2
  const top = centeredPosition.y - side / 2

  return {
    side,
    x: left,
    y: height - top - side,
  }
}

export const setupLandingScene = ({ canvas }: LandingElements): LandingSceneController => {
  const drawingCanvas = document.createElement('canvas')
  const initialContext = drawingCanvas.getContext('2d')
  if (!initialContext) {
    return {
      cleanup: () => {},
      setSize: () => {},
      setSizeNormalized: () => {},
      setUmbrellaAngle: () => {},
      setUmbrellaRotation: () => {},
      setUmbrellaOpen: () => {},
      setUmbrellaPosition: () => {},
      setUmbrellaPositionNormalized: () => {},
    }
  }
  const drawingContext: CanvasRenderingContext2D = initialContext

  let renderer: WebGLRenderer

  try {
    renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: 'high-performance',
    })
  } catch {
    return {
      cleanup: () => {},
      setSize: () => {},
      setSizeNormalized: () => {},
      setUmbrellaAngle: () => {},
      setUmbrellaRotation: () => {},
      setUmbrellaOpen: () => {},
      setUmbrellaPosition: () => {},
      setUmbrellaPositionNormalized: () => {},
    }
  }

  renderer.autoClear = false
  renderer.outputColorSpace = SRGBColorSpace

  const rainScene = new Scene()
  const rainCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  rainCamera.position.z = 2

  const texture = new CanvasTexture(drawingCanvas)
  texture.generateMipmaps = false
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter

  const planeGeometry = new PlaneGeometry(1, 1)
  const planeMaterial = new MeshBasicMaterial({
    depthTest: false,
    depthWrite: false,
    map: texture,
    transparent: true,
  })
  const plane = new Mesh(planeGeometry, planeMaterial)
  rainScene.add(plane)

  const modelScene = new Scene()
  const modelCamera = new PerspectiveCamera(30, 1, 0.1, 100)
  const ambientLight = new AmbientLight(0xffffff, 1.8)
  const keyLight = new DirectionalLight(0xffffff, 1.6)
  keyLight.position.set(3, 4, 5)
  const rimLight = new DirectionalLight(0x9d00ff, 1.3)
  rimLight.position.set(-4, 2, -3)
  modelScene.add(ambientLight, keyLight, rimLight)

  const modelPivot = new Group()
  modelScene.add(modelPivot)

  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const modelUrl = new URL('../assets/output.glb', import.meta.url).href
  const clock = new Clock()

  let shieldPoints: ShieldPoint[] = [
    {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    },
  ]
  let rainShields: RainShield[] = []
  let width = 0
  let height = 0
  let pendingSize: number | null = null
  let pendingSizeNormalized: number | null = null
  let pendingUmbrellaPosition: ShieldPoint | null = null
  let pendingUmbrellaPositionNormalized: NormalizedShieldPoint | null = null
  let modelViewport = getModelViewport(
    window.innerWidth,
    window.innerHeight,
    resolveUmbrellaPosition(
      window.innerWidth,
      window.innerHeight,
      pendingUmbrellaPosition,
      pendingUmbrellaPositionNormalized,
    ),
    resolveUmbrellaSize(window.innerWidth, window.innerHeight, pendingSize, pendingSizeNormalized),
  )
  let activeTouchPointers = new Map<number, ShieldPoint>()
  let disposed = false
  let umbrellaAction: AnimationAction | null = null
  let mixer: AnimationMixer | null = null
  let modelReady = false
  let autoRotationY = 0
  let pendingUmbrellaRotation: UmbrellaRotation = {
    x: 0,
    y: 0,
    z: 0,
  }
  let pendingUmbrellaOpen = 0

  const syncRainShields = () => {
    const nextRainShields: RainShield[] = shieldPoints.map((point) => ({
      kind: 'circle',
      onlyAbove: true,
      radius: SHIELD_RADIUS,
      repelXForce: SHIELD_REPEL_X_FORCE,
      repelYForce: SHIELD_REPEL_Y_FORCE,
      x: point.x,
      y: point.y,
    }))
    const umbrellaShield = getUmbrellaRainShield({
      height,
      open: pendingUmbrellaOpen,
      viewport: modelViewport,
    })

    if (umbrellaShield) {
      nextRainShields.push(umbrellaShield)
    }

    rainShields = nextRainShields
  }

  class RainDrop {
    x = 0
    y = 0
    z = 1
    len = 0
    speed = 0
    alpha = 0
    vx = 0

    constructor(state?: RainDropState) {
      if (state) {
        this.alpha = state.alpha
        this.len = state.len
        this.speed = state.speed
        this.vx = state.vx
        this.x = state.x
        this.y = state.y
        this.z = state.z
        return
      }

      this.reset()
      this.y = Math.random() * height
    }

    reset() {
      this.x = Math.random() * width
      this.y = -Math.random() * DROP_RESET_Y_RANGE
      this.z = Math.random() * DROP_Z_RANGE + DROP_Z_MIN
      this.len = Math.random() * DROP_LENGTH_RANGE + DROP_LENGTH_MIN
      this.speed = (Math.random() * DROP_SPEED_RANGE + DROP_SPEED_MIN) * this.z
      this.alpha = Math.random() * DROP_ALPHA_RANGE + DROP_ALPHA_MIN
      this.vx = 0
    }

    update() {
      this.y += this.speed
      this.x += this.vx
      this.vx *= DROP_VX_DAMPING

      let strongestForce = 0
      let strongestNormalX = 0
      let strongestNormalLength = 0
      let strongestRepelXForce = 0
      let strongestRepelYForce = 0

      for (const rainShield of rainShields) {
        const collision = getRainShieldCollision(this.x, this.y, rainShield)
        if (collision && collision.force > strongestForce) {
          strongestForce = collision.force
          strongestNormalX = collision.normalX
          strongestNormalLength = collision.normalLength
          strongestRepelXForce = collision.repelXForce
          strongestRepelYForce = collision.repelYForce
        }
      }

      if (strongestForce > 0 && strongestNormalLength > 0) {
        this.vx = (strongestNormalX / strongestNormalLength) * strongestForce * strongestRepelXForce
        this.y -= this.speed * strongestForce * strongestRepelYForce
      }

      if (this.y > height || this.x < 0 || this.x > width) {
        this.reset()
      }
    }

    draw() {
      drawingContext.beginPath()
      drawingContext.moveTo(this.x, this.y)
      drawingContext.lineTo(this.x - this.vx, this.y - this.len)
      drawingContext.strokeStyle = `rgba(${RAIN_COLOR_RGB}, ${this.alpha})`
      drawingContext.lineWidth = DROP_LINE_WIDTH * this.z
      drawingContext.lineCap = 'round'
      drawingContext.stroke()
    }

    toState(): RainDropState {
      return {
        alpha: this.alpha,
        len: this.len,
        speed: this.speed,
        vx: this.vx,
        x: this.x,
        y: this.y,
        z: this.z,
      }
    }
  }

  const drops: RainDrop[] = []

  const syncDropsToViewport = (previousViewport: ViewportSize) => {
    const resizedStates = resizeRainDropStates(
      drops.map((drop) => drop.toState()),
      previousViewport,
      {
        height,
        width,
      },
    )
    const count = getRainDropCount(width)
    const preservedCount = Math.min(resizedStates.length, count)

    drops.length = 0
    for (let index = 0; index < preservedCount; index += 1) {
      drops.push(new RainDrop(resizedStates[index]))
    }

    while (drops.length < count) {
      drops.push(new RainDrop())
    }
  }

  const resize = () => {
    const previousViewport = {
      height,
      width,
    }

    width = drawingCanvas.width = window.innerWidth
    height = drawingCanvas.height = window.innerHeight
    modelViewport = getModelViewport(
      width,
      height,
      resolveUmbrellaPosition(
        width,
        height,
        pendingUmbrellaPosition,
        pendingUmbrellaPositionNormalized,
      ),
      resolveUmbrellaSize(width, height, pendingSize, pendingSizeNormalized),
    )

    rainCamera.left = -width / 2
    rainCamera.right = width / 2
    rainCamera.top = height / 2
    rainCamera.bottom = -height / 2
    rainCamera.updateProjectionMatrix()

    plane.scale.set(width, height, 1)

    renderer.setPixelRatio(1)
    renderer.setSize(width, height, false)
    renderer.setViewport(0, 0, width, height)
    renderer.setScissorTest(false)

    drawingContext.clearRect(0, 0, width, height)
    syncDropsToViewport(previousViewport)
    syncRainShields()
  }

  const updatePointerPosition = (clientX: number, clientY: number) => {
    shieldPoints = [{ x: clientX, y: clientY }]
    syncRainShields()
  }

  const updateTouchPositions = (touches: ArrayLike<Pick<Touch, 'clientX' | 'clientY'>>) => {
    const nextShieldPoints: ShieldPoint[] = []

    for (let index = 0; index < touches.length; index += 1) {
      nextShieldPoints.push({
        x: touches[index].clientX,
        y: touches[index].clientY,
      })
    }

    if (nextShieldPoints.length > 0) {
      shieldPoints = nextShieldPoints
      syncRainShields()
    }
  }

  const handleMove = (event: MouseEvent) => {
    updatePointerPosition(event.clientX, event.clientY)
  }

  const syncActiveTouchPointers = () => {
    if (activeTouchPointers.size > 0) {
      shieldPoints = Array.from(activeTouchPointers.values())
      syncRainShields()
    }
  }

  const handlePointer = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      activeTouchPointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      })
      syncActiveTouchPointers()
      return
    }

    updatePointerPosition(event.clientX, event.clientY)
  }

  const handlePointerEnd = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
      return
    }

    activeTouchPointers.delete(event.pointerId)
    if (activeTouchPointers.size > 0) {
      syncActiveTouchPointers()
      return
    }

    updatePointerPosition(event.clientX, event.clientY)
  }

  const handleTouch = (event: TouchEvent) => {
    updateTouchPositions(event.touches.length > 0 ? event.touches : event.changedTouches)
  }

  const handlePointerListener: EventListener = (event) => {
    handlePointer(event as PointerEvent)
  }

  const handlePointerEndListener: EventListener = (event) => {
    handlePointerEnd(event as PointerEvent)
  }

  const handleTouchListener: EventListener = (event) => {
    handleTouch(event as TouchEvent)
  }

  const applyUmbrellaRotation = (extraYRadians = 0) => {
    const resolvedRotation = resolveUmbrellaRotation(pendingUmbrellaRotation)
    modelPivot.rotation.x = toRadians(resolvedRotation.x)
    modelPivot.rotation.y = toRadians(resolvedRotation.y) + extraYRadians
    modelPivot.rotation.z = toRadians(resolvedRotation.z)
  }

  const setUmbrellaRotation = (rotation: Partial<UmbrellaRotation>) => {
    pendingUmbrellaRotation = {
      x:
        typeof rotation.x === 'number' && Number.isFinite(rotation.x)
          ? rotation.x
          : pendingUmbrellaRotation.x,
      y:
        typeof rotation.y === 'number' && Number.isFinite(rotation.y)
          ? rotation.y
          : pendingUmbrellaRotation.y,
      z:
        typeof rotation.z === 'number' && Number.isFinite(rotation.z)
          ? rotation.z
          : pendingUmbrellaRotation.z,
    }
    applyUmbrellaRotation(mixer ? 0 : autoRotationY)
  }

  const setUmbrellaAngle = (degrees: number) => {
    setUmbrellaRotation({ z: degrees })
  }

  const setSize = (size: number | null) => {
    pendingSize = typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : null
    pendingSizeNormalized = null
    modelViewport = getModelViewport(
      width,
      height,
      resolveUmbrellaPosition(
        width,
        height,
        pendingUmbrellaPosition,
        pendingUmbrellaPositionNormalized,
      ),
      resolveUmbrellaSize(width, height, pendingSize, pendingSizeNormalized),
    )
    syncRainShields()
  }

  const setSizeNormalized = (size: number | null) => {
    pendingSize = null
    pendingSizeNormalized =
      typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : null
    modelViewport = getModelViewport(
      width,
      height,
      resolveUmbrellaPosition(
        width,
        height,
        pendingUmbrellaPosition,
        pendingUmbrellaPositionNormalized,
      ),
      resolveUmbrellaSize(width, height, pendingSize, pendingSizeNormalized),
    )
    syncRainShields()
  }

  const setUmbrellaOpen = (val: number) => {
    const normalizedValue = Math.min(1, Math.max(0, val))
    pendingUmbrellaOpen = normalizedValue
    syncRainShields()

    if (!umbrellaAction || !mixer) {
      return
    }

    const clipDuration = umbrellaAction.getClip().duration
    const targetTime = (1 - normalizedValue) * clipDuration

    umbrellaAction.enabled = true
    umbrellaAction.paused = true
    umbrellaAction.timeScale = 0
    umbrellaAction.play()
    mixer.setTime(targetTime)
    umbrellaAction.time = targetTime
  }

  const setUmbrellaPosition = (position: ShieldPoint | null) => {
    pendingUmbrellaPosition = position
    pendingUmbrellaPositionNormalized = null
    modelViewport = getModelViewport(
      width,
      height,
      resolveUmbrellaPosition(
        width,
        height,
        pendingUmbrellaPosition,
        pendingUmbrellaPositionNormalized,
      ),
      resolveUmbrellaSize(width, height, pendingSize, pendingSizeNormalized),
    )
    syncRainShields()
  }

  const setUmbrellaPositionNormalized = (position: NormalizedShieldPoint | null) => {
    pendingUmbrellaPosition = null
    pendingUmbrellaPositionNormalized = position
    modelViewport = getModelViewport(
      width,
      height,
      resolveUmbrellaPosition(
        width,
        height,
        pendingUmbrellaPosition,
        pendingUmbrellaPositionNormalized,
      ),
      resolveUmbrellaSize(width, height, pendingSize, pendingSizeNormalized),
    )
    syncRainShields()
  }

  const animate = () => {
    const delta = clock.getDelta()
    drawingContext.clearRect(0, 0, width, height)

    for (const drop of drops) {
      drop.update()
      drop.draw()
    }

    texture.needsUpdate = true

    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, width, height)
    renderer.clear()
    renderer.render(rainScene, rainCamera)

    if (modelReady) {
      if (mixer) {
        mixer.update(delta)
      } else {
        autoRotationY += MODEL_ROTATION_SPEED
        applyUmbrellaRotation(autoRotationY)
      }
      renderer.clearDepth()
      renderer.setScissorTest(true)
      renderer.setViewport(modelViewport.x, modelViewport.y, modelViewport.side, modelViewport.side)
      renderer.setScissor(modelViewport.x, modelViewport.y, modelViewport.side, modelViewport.side)
      renderer.render(modelScene, modelCamera)
      renderer.setScissorTest(false)
    }
  }

  loader.load(modelUrl, (gltf) => {
    if (disposed) {
      return
    }

    const model = gltf.scene
    const bounds = new Box3().setFromObject(model)
    const center = bounds.getCenter(new Vector3())
    const size = bounds.getSize(new Vector3())
    const maxDimension = Math.max(size.x, size.y, size.z, 1)

    model.position.sub(center)
    modelPivot.add(model)

    if (gltf.animations.length > 0) {
      mixer = new AnimationMixer(model)
      umbrellaAction = mixer.clipAction(gltf.animations[0])
      umbrellaAction.setLoop(LoopOnce, 1)
      umbrellaAction.clampWhenFinished = true

      setUmbrellaRotation(pendingUmbrellaRotation)
      setUmbrellaOpen(pendingUmbrellaOpen)
    }

    modelCamera.position.set(0, 0, maxDimension * MODEL_CAMERA_DISTANCE_MULTIPLIER)
    modelCamera.lookAt(0, 0, 0)
    modelCamera.near = maxDimension / 100
    modelCamera.far = maxDimension * 20
    modelCamera.aspect = 1
    modelCamera.updateProjectionMatrix()

    modelReady = true
  })

  resize()

  if ('PointerEvent' in window) {
    document.addEventListener('pointerdown', handlePointerListener, PASSIVE_EVENT_OPTIONS)
    document.addEventListener('pointermove', handlePointerListener, PASSIVE_EVENT_OPTIONS)
    document.addEventListener('pointerup', handlePointerEndListener, PASSIVE_EVENT_OPTIONS)
    document.addEventListener('pointercancel', handlePointerEndListener, PASSIVE_EVENT_OPTIONS)
  } else {
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('touchstart', handleTouchListener, PASSIVE_EVENT_OPTIONS)
    document.addEventListener('touchmove', handleTouchListener, PASSIVE_EVENT_OPTIONS)
    document.addEventListener('touchend', handleTouchListener, PASSIVE_EVENT_OPTIONS)
    document.addEventListener('touchcancel', handleTouchListener, PASSIVE_EVENT_OPTIONS)
  }

  window.addEventListener('resize', resize)
  renderer.setAnimationLoop(animate)

  const cleanup = () => {
    disposed = true
    window.removeEventListener('resize', resize)
    if ('PointerEvent' in window) {
      document.removeEventListener('pointerdown', handlePointerListener, PASSIVE_EVENT_OPTIONS)
      document.removeEventListener('pointermove', handlePointerListener, PASSIVE_EVENT_OPTIONS)
      document.removeEventListener('pointerup', handlePointerEndListener, PASSIVE_EVENT_OPTIONS)
      document.removeEventListener('pointercancel', handlePointerEndListener, PASSIVE_EVENT_OPTIONS)
    } else {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('touchstart', handleTouchListener, PASSIVE_EVENT_OPTIONS)
      document.removeEventListener('touchmove', handleTouchListener, PASSIVE_EVENT_OPTIONS)
      document.removeEventListener('touchend', handleTouchListener, PASSIVE_EVENT_OPTIONS)
      document.removeEventListener('touchcancel', handleTouchListener, PASSIVE_EVENT_OPTIONS)
    }

    activeTouchPointers = new Map()
    renderer.setAnimationLoop(null)
    planeGeometry.dispose()
    planeMaterial.dispose()
    texture.dispose()
    renderer.dispose()
  }

  return {
    cleanup,
    setSize,
    setSizeNormalized,
    setUmbrellaAngle,
    setUmbrellaRotation,
    setUmbrellaOpen,
    setUmbrellaPosition,
    setUmbrellaPositionNormalized,
  }
}
