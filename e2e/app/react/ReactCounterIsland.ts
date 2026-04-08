import { eclipsifyReact } from '@eclipsa/react'
import { createElement, useState } from 'react'

const ReactCounterView = (props: { label: string; children?: unknown }) => {
  const [count, setCount] = useState(0)

  return createElement('section', { 'data-testid': 'react-island-root' }, [
    createElement(
      'p',
      { key: 'count', 'data-testid': 'react-island-count' },
      `${props.label}:${count}`,
    ),
    createElement(
      'button',
      {
        key: 'button',
        onClick: () => setCount((value) => value + 1),
        type: 'button',
      },
      'Increment React',
    ),
    createElement(
      'div',
      { key: 'slot', 'data-testid': 'react-island-slot' },
      props.children as any,
    ),
  ])
}

export const ReactCounterIsland = eclipsifyReact(ReactCounterView)
