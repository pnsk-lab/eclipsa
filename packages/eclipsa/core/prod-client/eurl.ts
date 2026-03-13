const eurlMaps = new Map<string, unknown>()

export const fetchEurl = async (id: string): Promise<unknown> => {
  const url = `/${id}`
  const got = eurlMaps.get(id)
  if (got) {
    return got
  }
  const imported = await import(/* @vite-ignore */ url)
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

export const eurlFn = async (id: string): Promise<unknown> => {
  const imported = (await fetchEurl(id)) as {
    default: (vars: Record<string, unknown>) => () => unknown
    parentEurl: string
    depEurls: string[]
  }

  return imported.default
}
