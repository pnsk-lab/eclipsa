import fg from "fast-glob";
import path from "node:path";
import type { RouteManifest } from "../../core/router-shared.ts";

export const normalizeRoutePath = (pathname: string) => {
  const normalizedPath = pathname.trim() || "/";
  const withLeadingSlash = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
};

const filePathToHonoPath = (filePath: string) => {
  const segments = filePath.split("/").slice(0, -1);

  return normalizeRoutePath(segments.join("/") || "/");
};

export interface RouteEntry {
  filePath: string;
  honoPath: string;
  entryName: string;
}

const toEntryName = (relativePath: string) => {
  const normalized = relativePath.replaceAll("\\", "/");
  const withoutExt = normalized.replace(/\.tsx$/, "");
  const segments = withoutExt.split("/");
  const mapped = segments.map((segment) => {
    if (segment === "+page") {
      return "page";
    }
    return segment.replaceAll(/[^a-zA-Z0-9]+/g, "_") || "index";
  });

  return mapped.join("__");
};
export const createRoutes = async (root: string): Promise<RouteEntry[]> => {
  const appDir = path.join(root, "app");
  const result: RouteEntry[] = [];
  for await (const entry of fg.stream(path.join(root, "/**/+page.tsx").replaceAll("\\", "/"))) {
    const relativePath = path.relative(appDir, entry.toString());
    result.push({
      entryName: toEntryName(relativePath),
      filePath: entry.toString(),
      honoPath: filePathToHonoPath(relativePath),
    });
  }
  return result;
};

export const createDevRouteUrl = (root: string, route: RouteEntry) =>
  `/${path.relative(root, route.filePath).replaceAll("\\", "/")}`;

export const createBuildRouteUrl = (route: RouteEntry) => `/entries/route__${route.entryName}.js`;

export const createRouteManifest = (
  routes: RouteEntry[],
  resolveUrl: (route: RouteEntry) => string,
): RouteManifest =>
  Object.fromEntries(routes.map((route) => [normalizeRoutePath(route.honoPath), resolveUrl(route)]));
