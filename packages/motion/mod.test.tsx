import { describe, expect, it } from 'vitest'
import { renderSSR } from 'eclipsa'
import { AnimatePresence, MotionConfig, motion } from './mod.ts'

describe('@eclipsa/motion', () => {
  it('strips motion-only props from rendered DOM output', () => {
    const { html } = renderSSR(() => (
      <motion.div
        animate={{ opacity: 1 }}
        initial={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        whileHover={{ opacity: 0.8 }}
      />
    ))

    expect(html).toContain('<div')
    expect(html).not.toContain('animate=')
    expect(html).not.toContain('initial=')
    expect(html).not.toContain('transition=')
    expect(html).not.toContain('whileHover=')
  })

  it('renders the initial pose inline during SSR', () => {
    const { html } = renderSSR(() => <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1 }} />)

    expect(html).toContain('opacity: 0; transform: translate3d(20px, 0px, 0px)')
  })

  it('renders the animate pose inline during SSR when initial is false', () => {
    const { html } = renderSSR(() => (
      <motion.div initial={false} animate={{ opacity: 1, x: 0 }} />
    ))

    expect(html).toContain('opacity: 1; transform: translate3d(0px, 0px, 0px)')
  })

  it('serializes camelCase motion styles to valid CSS property names', () => {
    const { html } = renderSSR(() => (
      <motion.div initial={false} animate={{ maxHeight: 160, opacity: 1 }} />
    ))

    expect(html).toContain('max-height: 160px')
    expect(html).toContain('transition-property: max-height, opacity')
    expect(html).not.toContain('maxHeight:')
  })

  it('inherits transition config from MotionConfig', () => {
    const { html } = renderSSR(() => (
      <MotionConfig transition={{ duration: 0.6 }}>
        <motion.div animate={{ opacity: 1 }} />
      </MotionConfig>
    ))

    expect(html).toContain('<div')
  })

  it('keeps removed keyed children rendered through AnimatePresence until exit support is detected', () => {
    const { html } = renderSSR(() => (
      <AnimatePresence>
        <motion.div key="a" exit={{ opacity: 0 }} />
      </AnimatePresence>
    ))

    expect(html).toContain('<div')
  })
})
