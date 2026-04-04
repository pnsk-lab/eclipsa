import { describe, expect, it } from 'vitest'
import { getRainShieldCollision, getUmbrellaRainShield } from './landing-scene-shields.ts'

describe('landing scene shields', () => {
  it('creates an umbrella ellipse in screen space once the umbrella opens', () => {
    const shield = getUmbrellaRainShield({
      height: 900,
      open: 0.75,
      viewport: {
        side: 400,
        x: 520,
        y: 180,
      },
    })

    expect(shield).toEqual({
      kind: 'ellipse',
      onlyAbove: true,
      radiusX: 106,
      radiusY: 33,
      repelXForce: 16,
      repelYForce: 1.25,
      x: 720,
      y: 438,
    })
  })

  it('ignores rain below the umbrella canopy but repels drops above it', () => {
    const shield = getUmbrellaRainShield({
      height: 900,
      open: 1,
      viewport: {
        side: 400,
        x: 520,
        y: 180,
      },
    })

    expect(shield).not.toBeNull()
    expect(getRainShieldCollision(720, 510, shield!)).toBeNull()
    expect(getRainShieldCollision(720, 420, shield!)).toEqual({
      force: 0.7,
      normalLength: 0.3,
      normalX: 0,
      repelXForce: 16,
      repelYForce: 1.25,
    })
  })
})
