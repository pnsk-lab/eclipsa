export interface EurlChunkMeta {
  parentComponent?: string
  depsEurls?: string[]
}
export interface EurlChunk {
  default(vars: Record<string, unknown>): () => unknown
  meta?: EurlChunkMeta
}
