import type { ViteHotContext } from 'vite/types/hot'

export const initHot = (hot: ViteHotContext | undefined, url: URL) => {
  if (!hot) {
    return
  }
  console.log(hot, url)
  hot.accept((mod) => {
    console.log(mod)
  })
}
