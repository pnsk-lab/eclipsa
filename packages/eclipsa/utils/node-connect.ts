import type {
  IncomingMessage,
  ServerResponse,
} from 'node:http'

export const incomingMessageToRequest = (
  incomingMessage: IncomingMessage,
): Request => {
  const body =
    (incomingMessage.method !== 'GET' && incomingMessage.method !== 'HEAD')
      ? new ReadableStream<Uint8Array>({
        start(controller) {
          incomingMessage.on('data', (chunk) => {
            controller.enqueue(new Uint8Array(chunk))
          })
          incomingMessage.on('end', () => {
            controller.close()
          })
        },
      })
      : null
  const headers = new Headers()
  for (const [k, v] of Object.entries(incomingMessage.headers)) {
    if (Array.isArray(v)) {
      for (const value of v) {
        headers.append(k, value)
      }
    } else if (v) {
      headers.append(k, v)
    }
  }
  return new Request(new URL(incomingMessage.url ?? '', 'http://localhost'), {
    method: incomingMessage.method,
    body,
    headers,
  })
}

export const responseForServerResponse = async (
  res: Response,
  serverRes: ServerResponse,
) => {
  for (const [k, v] of res.headers) {
    serverRes.setHeader(k, v)
  }
  serverRes.statusCode = res.status
  serverRes.statusMessage = res.statusText

  if (res.body) {
    for await (const chunk of res.body) {
      serverRes.write(chunk)
    }
  }
  serverRes.end()
}
