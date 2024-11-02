export interface DevClientInfo {
  entry: {
    absolutePath: string
    url: string
  }
}

interface ElemWithKey {
  (): Insertable
  key?: string | symbol | number
  returnFn?: boolean
}
export type Insertable = string | number | boolean | undefined | null | Node | Insertable[] | ElemWithKey

export type ClientElementLike = (Insertable | Insertable[])
