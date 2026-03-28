import { useSignal } from 'eclipsa'
import { motion } from '@eclipsa/motion'

export const metadata = {
  title: 'Motion | E2E',
}

export default () => {
  const cardVisible = useSignal(true)
  const activeTab = useSignal<'left' | 'right'>('left')

  return (
    <section>
      <motion.h1>Motion Playground</motion.h1>

      <button
        type="button"
        onClick={() => {
          cardVisible.value = !cardVisible.value
        }}
      >
        Toggle motion card
      </button>

      <motion.div
        data-testid="motion-card"
        initial={false}
        animate={cardVisible.value ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
        transition={{ duration: 0.12 }}
      >
        Motion card
      </motion.div>

      <div class="mt-8 flex gap-4" data-testid="motion-tabs">
        <button
          type="button"
          onClick={() => {
            activeTab.value = 'left'
          }}
        >
          Left
        </button>
        <button
          type="button"
          onClick={() => {
            activeTab.value = 'right'
          }}
        >
          Right
        </button>
      </div>

      {activeTab.value === 'left' ? (
        <div data-testid="motion-indicator">
          Left active
        </div>
      ) : (
        <div data-testid="motion-indicator">
          Right active
        </div>
      )}
    </section>
  )
}
