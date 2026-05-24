import type { EclipsaServerAdapterPlugin } from 'eclipsa/vite'

export interface EclipsaNodePluginOptions {
  entry?: string
}

const renderNodeServer = () => `import createHandler from "./index.mjs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const handler = createHandler();

const fileTypes = new Map([
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, "../client");

const toRequest = (incomingMessage) => {
  const body =
    incomingMessage.method !== "GET" && incomingMessage.method !== "HEAD"
      ? new ReadableStream({
          start(controller) {
            incomingMessage.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
            incomingMessage.on("end", () => controller.close());
          },
        })
      : null;
  const headers = new Headers();
  for (const [key, value] of Object.entries(incomingMessage.headers)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => headers.append(key, entry));
    } else if (value) {
      headers.append(key, value);
    }
  }
  return new Request(new URL(incomingMessage.url ?? "/", "http://localhost"), {
    method: incomingMessage.method,
    headers,
    body,
  });
};

const sendResponse = async (response, serverResponse) => {
  for (const [key, value] of response.headers) {
    serverResponse.setHeader(key, value);
  }
  serverResponse.statusCode = response.status;
  serverResponse.statusMessage = response.statusText;
  const buffer = Buffer.from(await response.arrayBuffer());
  serverResponse.end(buffer);
};

const serveStatic = async (pathname) => {
  const normalized = pathname.replace(/^\\/+/, "");
  const filePath = path.join(clientDir, normalized);
  if (!filePath.startsWith(clientDir)) {
    return null;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return null;
    }
    return new Response(await readFile(filePath), {
      headers: {
        "content-type": fileTypes.get(path.extname(filePath)) ?? "application/octet-stream",
      },
    });
  } catch {
    return null;
  }
};

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const staticResponse = await serveStatic(url.pathname);
  if (staticResponse) {
    await sendResponse(staticResponse, res);
    return;
  }

  const response = await handler(toRequest(req));
  await sendResponse(response, res);
});

server.listen(port, () => {
  console.log("Eclipsa server listening on http://localhost:" + port);
});
`

export const node = (options: EclipsaNodePluginOptions = {}): EclipsaServerAdapterPlugin => {
  const entry = options.entry ?? 'node.mjs'
  return {
    name: '@eclipsa/node',
    eclipsaServerAdapter: {
      name: '@eclipsa/node',
      buildFiles: () => [
        {
          path: entry,
          contents: renderNodeServer(),
        },
      ],
    },
  } satisfies EclipsaServerAdapterPlugin
}
