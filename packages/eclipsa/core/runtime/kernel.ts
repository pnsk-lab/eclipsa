let runtimeSymbols: Record<string, string> = {}

export const setRuntimeSymbols = (symbols: Record<string, string> | undefined) => {
  runtimeSymbols = symbols ?? {}
}

export const getRuntimeSymbolUrl = (symbol: string) => runtimeSymbols[symbol]
