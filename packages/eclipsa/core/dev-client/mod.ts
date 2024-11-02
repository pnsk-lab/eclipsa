import type { DevClientInfo } from './types.ts'
import { hydrate } from './dom.ts'

const getDevInfo = (): DevClientInfo => {
  const elem = document.getElementById('eclipsa-devinfo')

  if (!elem) {
    throw new Error('devinfo element is falsy.')
  }

  return JSON.parse(elem.innerHTML)
}

export const initDevClient = async () => {
  const Component =
    (await import(/* @vite-ignore */ getDevInfo().entry.url)).default
  hydrate(Component, document.body)
}

export * from './dom.ts'
export * from './hot.ts'
