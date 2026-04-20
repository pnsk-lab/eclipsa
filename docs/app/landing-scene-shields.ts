export interface RainShieldCollision {
  force: number
  normalLength: number
  normalX: number
  repelXForce: number
  repelYForce: number
}

interface RainShieldBase {
  onlyAbove?: boolean
  repelXForce: number
  repelYForce: number
  x: number
  y: number
}

export interface CircleRainShield extends RainShieldBase {
  kind: 'circle'
  radius: number
}

export interface EllipseRainShield extends RainShieldBase {
  kind: 'ellipse'
  radiusX: number
  radiusY: number
}

export type RainShield = CircleRainShield | EllipseRainShield

export interface UmbrellaRainShieldInput {
  height: number
  open: number
  viewport: {
    side: number
    x: number
    y: number
  }
}

const UMBRELLA_OPEN_THRESHOLD = 0.05
const UMBRELLA_REPEL_X_FORCE = 16
const UMBRELLA_REPEL_Y_FORCE = 1.25

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const getCircleRainShieldCollision = (
  x: number,
  y: number,
  shield: CircleRainShield,
): RainShieldCollision | null => {
  const dx = x - shield.x
  const dy = y - shield.y

  if (shield.onlyAbove && dy >= 0) {
    return null
  }

  const distance = Math.sqrt(dx * dx + dy * dy)
  if (distance <= 0 || distance >= shield.radius) {
    return null
  }

  return {
    force: (shield.radius - distance) / shield.radius,
    normalLength: distance,
    normalX: dx,
    repelXForce: shield.repelXForce,
    repelYForce: shield.repelYForce,
  }
}

const getEllipseRainShieldCollision = (
  x: number,
  y: number,
  shield: EllipseRainShield,
): RainShieldCollision | null => {
  const dx = x - shield.x
  const dy = y - shield.y

  if (shield.onlyAbove && dy >= 0) {
    return null
  }

  const normalizedX = dx / shield.radiusX
  const normalizedY = dy / shield.radiusY
  const normalizedDistance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY)

  if (normalizedDistance <= 0 || normalizedDistance >= 1) {
    return null
  }

  return {
    force: 1 - normalizedDistance,
    normalLength: normalizedDistance,
    normalX: normalizedX,
    repelXForce: shield.repelXForce,
    repelYForce: shield.repelYForce,
  }
}

export const getRainShieldCollision = (
  x: number,
  y: number,
  shield: RainShield,
): RainShieldCollision | null =>
  shield.kind === 'circle'
    ? getCircleRainShieldCollision(x, y, shield)
    : getEllipseRainShieldCollision(x, y, shield)

export const getUmbrellaRainShield = ({
  height,
  open,
  viewport,
}: UmbrellaRainShieldInput): EllipseRainShield | null => {
  if (
    !Number.isFinite(height) ||
    height <= 0 ||
    !Number.isFinite(viewport.side) ||
    viewport.side <= 0
  ) {
    return null
  }

  const normalizedOpen = clamp01(open)
  if (normalizedOpen < UMBRELLA_OPEN_THRESHOLD) {
    return null
  }

  const viewportTop = height - viewport.y - viewport.side

  return {
    kind: 'ellipse',
    onlyAbove: true,
    radiusX: viewport.side * (0.1 + normalizedOpen * 0.22),
    radiusY: viewport.side * (0.03 + normalizedOpen * 0.07),
    repelXForce: UMBRELLA_REPEL_X_FORCE,
    repelYForce: UMBRELLA_REPEL_Y_FORCE,
    x: viewport.x + viewport.side * 0.5,
    y: viewportTop + viewport.side * (0.34 - normalizedOpen * 0.06),
  }
}
