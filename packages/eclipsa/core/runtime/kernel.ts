let runtimeSymbols: Record<string, string> = {}

export const setRuntimeSymbols = (symbols: Record<string, string> | undefined) => {
  runtimeSymbols = symbols ? { ...symbols } : {}
}

export const registerRuntimeSymbols = (symbols: Record<string, string> | undefined) => {
  if (!symbols) {
    return
  }
  Object.assign(runtimeSymbols, symbols)
}

export const setRuntimeSymbolUrl = (symbol: string, url: string) => {
  runtimeSymbols[symbol] = url
}

export const getRuntimeSymbolUrl = (symbol: string) => runtimeSymbols[symbol]
