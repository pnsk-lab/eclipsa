export const PLAYGROUND_RESPONSE_HEADERS = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
} as const

export const isPlaygroundPathname = (pathname: string) =>
  pathname === '/playground' || pathname.startsWith('/playground/')
