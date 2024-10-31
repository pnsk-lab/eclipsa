export interface DevClientInfo {
  entry: {
    absolutePath: string
    url: string
  }
}

export type Insertable = string | number | boolean | undefined | null | Node

export type ClientElementLike = (Insertable | Insertable[])
