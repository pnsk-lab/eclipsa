import { eclipsifyVue } from '@eclipsa/vue'
import { defineComponent, h, ref } from 'vue'

const VueCounterView = defineComponent({
  props: {
    label: {
      required: true,
      type: String,
    },
  },
  setup(props, { slots }) {
    const count = ref(0)

    return () =>
      h('section', { 'data-testid': 'vue-island-root' }, [
        h('p', { 'data-testid': 'vue-island-count' }, `${props.label}:${count.value}`),
        h(
          'button',
          {
            onClick: () => {
              count.value += 1
            },
            type: 'button',
          },
          'Increment Vue',
        ),
        h(
          'div',
          { 'data-testid': 'vue-island-slot' },
          slots.default ? slots.default() : [],
        ),
      ])
  },
})

export const VueCounterIsland = eclipsifyVue(VueCounterView)
