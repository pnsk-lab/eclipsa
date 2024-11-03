const eurlMaps = new Map<string, unknown>()

export const fetchEurl = async (id: string): Promise<unknown> => {
  const url = `/${id}`
  const imported = await import(/* @vite-ignore */url)
  eurlMaps.set(id, imported)
  return imported
}

export const getEurl = (id: string): unknown => {
  const data = eurlMaps.get(id)
  if (!data) {
    throw new Error(`eurl ${id} haven't loaded yet.`)
  }
  return data
}
