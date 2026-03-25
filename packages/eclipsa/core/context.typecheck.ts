import type { Component } from './component.ts'
import {
  createContext,
  useContext,
  type Context,
  type ContextProviderProps,
} from './context.ts'

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false
type Expect<T extends true> = T

const NumberContext = createContext<number>()

type _Context = Expect<Equal<typeof NumberContext, Context<number>>>
type _Provider = Expect<
  Equal<typeof NumberContext.Provider, Component<ContextProviderProps<number>>>
>
type _ProviderProps = Expect<
  Equal<Parameters<typeof NumberContext.Provider>[0], ContextProviderProps<number>>
>

const readNumber = () => {
  const value = useContext(NumberContext)
  type _Value = Expect<Equal<typeof value, number>>
  return value
}

declare const NumberProvider: typeof NumberContext.Provider

NumberProvider({
  children: 'ok',
  value: readNumber(),
})

NumberProvider({
  // @ts-expect-error Provider value must match the context type.
  value: 'nope',
})
