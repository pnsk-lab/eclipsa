import { describe, expect, it } from 'vitest'
import {
  MODEL_ROTATION_OFFSET,
  getRainDropCount,
  resizeRainDropStates,
  resolveUmbrellaRotation,
  resolveUmbrellaSize,
} from './landing-scene.ts'

describe('landing scene', () => {
  it('applies the model rotation offset so authored rotations can stay relative', () => {
    expect(MODEL_ROTATION_OFFSET).toEqual({
      x: 90,
      y: 0,
      z: 0,
    })
    expect(
      resolveUmbrellaRotation({
        x: 0,
        y: 45,
        z: -10,
      }),
    ).toEqual({
      x: 90,
      y: 45,
      z: -10,
    })
  })

  it('resolves normalized umbrella size against the larger viewport dimension', () => {
    expect(resolveUmbrellaSize(1200, 800, null, 0.5)).toBe(600)
    expect(resolveUmbrellaSize(800, 1200, null, 0.5)).toBe(600)
  })

  it('falls back to explicit size when normalized size is not usable', () => {
    expect(resolveUmbrellaSize(1200, 800, 320, null)).toBe(320)
    expect(resolveUmbrellaSize(1200, 800, 320, 0)).toBe(320)
  })

  it('rescales rain drops to the new viewport instead of resetting their progress on resize', () => {
    expect(
      resizeRainDropStates(
        [
          {
            alpha: 0.3,
            len: 24,
            speed: 18,
            vx: 4,
            x: 900,
            y: 300,
            z: 1.2,
          },
        ],
        { height: 600, width: 1200 },
        { height: 900, width: 600 },
      ),
    ).toEqual([
      {
        alpha: 0.3,
        len: 24,
        speed: 18,
        vx: 4,
        x: 450,
        y: 450,
        z: 1.2,
      },
    ])
  })

  it('switches rain density when the viewport crosses the mobile breakpoint', () => {
    expect(getRainDropCount(767)).toBe(50)
    expect(getRainDropCount(768)).toBe(150)
  })
})
