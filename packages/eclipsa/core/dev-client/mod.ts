import type { DevClientInfo } from './types.ts'

const getDevInfo = (): DevClientInfo => {
  const elem = document.getElementById('eclipsa-devinfo')

  if (!elem) {
    throw new Error('devinfo element is falsy.')
  }

  return JSON.parse(elem.innerHTML)
}

export const initDevClient = async () => {
  console.log((await import(/* @vite-ignore */getDevInfo().filePath)).default())
  console.log('Hello!')
}
