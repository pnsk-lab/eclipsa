import type { ViteHotContext } from 'vite/types/hot'

export const initHot = (hot: ViteHotContext | undefined, stringURL: string) => {
  if (!hot) {
    return
  }
  const url = new URL(stringURL)
  const id = url.pathname

  hot.on('update-client', async data => {
    const hotTargetId: string = data.url
    if (hotTargetId === id) {
      // Update module
      const newModURL = new URL(hotTargetId, stringURL)
      newModURL.searchParams.append('t', Date.now().toString())
      const newMod = await import(newModURL.href)
      console.log(newMod)
    }
  })
}
