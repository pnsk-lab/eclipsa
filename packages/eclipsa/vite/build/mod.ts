import type { UserConfig, ViteBuilder } from "vite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { cwd } from "node:process";
import { createRoutes } from "../utils/routing.ts";
import { collectAppSymbols, createBuildSymbolUrl } from "../compiler.ts";

const renderServer = (
  routes: Awaited<ReturnType<typeof createRoutes>>,
  symbolUrls: Record<string, string>,
) => {
  const routeTable = routes
    .map(
      (route) =>
        `  ${JSON.stringify(route.honoPath)}: { load: () => import("../ssr/entries/route__${route.entryName}.mjs") },`,
    )
    .join("\n");

  const serializedSymbolUrls = JSON.stringify(symbolUrls);

  return `import userApp from "../ssr/entries/server_entry.mjs";
import SSRRoot from "../ssr/entries/ssr_root.mjs";
import { Fragment, jsxDEV, renderSSR, serializeResumePayload } from "../ssr/entries/eclipsa_runtime.mjs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = userApp;
const routes = {
${routeTable}
};
const symbolUrls = ${serializedSymbolUrls};

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

const injectResumeScript = (html, payloadScript) =>
  html.includes("</head>") ? html.replace("</head>", payloadScript + "</head>") : payloadScript + html;

for (const [routePath, route] of Object.entries(routes)) {
  app.get(routePath, async (c) => {
    const { default: Page } = await route.load();
    const document = SSRRoot({
      children: jsxDEV(Page, {}, null, false, {}),
      head: {
        type: Fragment,
        isStatic: true,
        props: {
          children: [
            {
              type: "script",
              isStatic: true,
              props: {
                type: "module",
                src: "/entries/client_boot.js",
              },
            },
          ],
        },
      },
    });

    const { html, payload } = renderSSR(() => document, {
      symbols: symbolUrls,
    });
    const payloadScript = '<script type="application/eclipsa-resume+json" id="eclipsa-resume">' + serializeResumePayload(payload) + "</script>";
    return c.html(injectResumeScript(html, payloadScript));
  });
}

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const staticResponse = await serveStatic(url.pathname);
  if (staticResponse) {
    await sendResponse(staticResponse, res);
    return;
  }

  const response = await app.fetch(toRequest(req));
  await sendResponse(response, res);
}).listen(port, () => {
  console.log("Eclipsa server listening on http://localhost:" + port);
});
`;
};

export const build = async (builder: ViteBuilder, userConfig: UserConfig) => {
  const root = userConfig.root ?? cwd();
  const routes = await createRoutes(root);
  const symbols = await collectAppSymbols(root);
  const symbolUrls = Object.fromEntries(
    symbols.map((symbol) => [symbol.id, createBuildSymbolUrl(symbol.id)]),
  );

  await builder.build(builder.environments.client);
  await builder.build(builder.environments.ssr);

  const serverDir = path.join(root, "dist/server");
  await fs.mkdir(serverDir, { recursive: true });
  await fs.writeFile(path.join(serverDir, "index.mjs"), renderServer(routes, symbolUrls));
};
