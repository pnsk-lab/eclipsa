import { describe, expect, it } from 'vitest'
import {
  deserializeValue,
  escapeInlineScriptText,
  escapeJSONScriptText,
  serializeValue,
} from './serialize.ts'

describe('serializeValue', () => {
  it('round-trips nested plain data, maps, and sets', () => {
    const value = {
      map: new Map<unknown, unknown>([
        ['a', 1],
        ['b', { ok: true }],
      ]),
      nested: [{ answer: 42 }, new Set(['x', 'y'])],
    }

    const serialized = serializeValue(value)
    const decoded = deserializeValue(serialized) as {
      map: Map<string, unknown>
      nested: [Record<string, unknown>, Set<string>]
    }

    expect(decoded.map.get('a')).toBe(1)
    expect(decoded.map.get('b')).toEqual(Object.assign(Object.create(null), { ok: true }))
    expect(decoded.nested[0]).toEqual(Object.assign(Object.create(null), { answer: 42 }))
    expect([...decoded.nested[1]]).toEqual(['x', 'y'])
  })

  it('rejects circular values', () => {
    const value: Record<string, unknown> = {}
    value.self = value

    expect(() => serializeValue(value)).toThrow('Circular values cannot be serialized.')
  })

  it('rejects sparse arrays', () => {
    const value: unknown[] = []
    value.length = 2
    value[1] = 'x'

    expect(() => serializeValue(value)).toThrow('Sparse arrays cannot be serialized.')
  })

  it('rejects accessor objects', () => {
    const value = {}
    Object.defineProperty(value, 'secret', {
      enumerable: true,
      get() {
        return 'x'
      },
    })

    expect(() => serializeValue(value)).toThrow('Objects with accessors cannot be serialized')
  })

  it('rejects unsupported objects commonly involved in server gadget chains', () => {
    expect(() => serializeValue(new Date())).toThrow('Unsupported object')
    expect(() => serializeValue(new URL('https://example.com'))).toThrow('Unsupported object')
    expect(() => serializeValue(new Error('boom'))).toThrow('Unsupported object')
  })

  it('rejects non-finite numbers', () => {
    expect(() => serializeValue(NaN)).toThrow('Non-finite numbers cannot be serialized.')
    expect(() => serializeValue(Infinity)).toThrow('Non-finite numbers cannot be serialized.')
    expect(() => serializeValue(-Infinity)).toThrow('Non-finite numbers cannot be serialized.')
  })

  it('keeps hostile keys inert on decode', () => {
    const decoded = deserializeValue({
      __eclipsa_type: 'object',
      entries: [
        ['__proto__', 'safe'],
        ['constructor', 'still-safe'],
        ['prototype', 'also-safe'],
      ],
    }) as Record<string, unknown>

    expect(Object.getPrototypeOf(decoded)).toBeNull()
    expect(decoded.__proto__).toBe('safe')
    expect(decoded.constructor).toBe('still-safe')
    expect(decoded.prototype).toBe('also-safe')
    expect(({} as Record<string, unknown>).safe).toBeUndefined()
  })

  it('rejects malformed references', () => {
    expect(() =>
      deserializeValue(
        {
          __eclipsa_type: 'ref',
          kind: 'signal',
        } as any,
        {
          deserializeReference() {
            return null
          },
        },
      ),
    ).toThrow('Malformed serialized reference.')
  })

  it('enforces depth and entry budgets', () => {
    let deep: unknown = 'leaf'
    for (let index = 0; index < 70; index += 1) {
      deep = [deep]
    }
    expect(() => serializeValue(deep)).toThrow('maximum depth')

    expect(() => serializeValue(Array.from({ length: 10_100 }, () => 0))).toThrow(
      'maximum entry budget',
    )
  })

  it('escapes script-breaking content', () => {
    const escaped = escapeJSONScriptText('"</script>\u2028\u2029&<>"')
    expect(escaped).not.toContain('</script>')
    expect(escaped).toContain('\\u003C')
    expect(escaped).toContain('\\u003E')
    expect(escaped).toContain('\\u2028')
    expect(escaped).toContain('\\u2029')
    expect(escaped).toContain('\\u0026')
  })

  it('keeps raw inline script operators intact while escaping html terminators', () => {
    const escaped = escapeInlineScriptText('(()=>a > b && c < d)</script>\u2028\u2029')
    expect(escaped).not.toContain('</script>')
    expect(escaped).toContain('=>a > b')
    expect(escaped).not.toContain('\\u003E')
    expect(escaped).toContain('\\u003C')
    expect(escaped).toContain('\\u2028')
    expect(escaped).toContain('\\u2029')
  })
})
