import fg from "fast-glob";
import path from "node:path";

// WIP
const filePathToHonoPath = (filePath: string) => {
  const segments = filePath.split("/").slice(0, -1);

  return segments.join("/") || "/";
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
  const result = [];
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
