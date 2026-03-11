import * as fs from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import {
  analyzeModule,
  compileClientModule,
  compileSSRModule,
  type AnalyzedModule,
  type ResumeSymbol,
} from "../compiler/mod.ts";

const SYMBOL_QUERY = "eclipsa-symbol";

interface AnalyzedEntry {
  analyzed: AnalyzedModule;
  source: string;
}

const cache = new Map<string, AnalyzedEntry>();

const stripQuery = (id: string) => {
  const queryIndex = id.indexOf("?");
  if (queryIndex < 0) {
    return id;
  }
  return id.slice(0, queryIndex);
};

export const parseSymbolRequest = (id: string): { filePath: string; symbolId: string } | null => {
  const queryIndex = id.indexOf("?");
  if (queryIndex < 0) {
    return null;
  }

  const params = new URLSearchParams(id.slice(queryIndex + 1));
  const symbolId = params.get(SYMBOL_QUERY);
  if (!symbolId) {
    return null;
  }

  return {
    filePath: id.slice(0, queryIndex),
    symbolId,
  };
};

const loadAnalyzedModule = async (filePath: string, source?: string) => {
  const normalizedPath = stripQuery(filePath);
  const resolvedSource = source ?? await fs.readFile(normalizedPath, "utf8");
  const cached = cache.get(normalizedPath);
  if (cached?.source === resolvedSource) {
    return cached.analyzed;
  }

  const analyzed = await analyzeModule(resolvedSource, normalizedPath);
  if (!analyzed) {
    throw new Error(`Failed to compile ${normalizedPath}.`);
  }

  cache.set(normalizedPath, {
    analyzed,
    source: resolvedSource,
  });

  return analyzed;
};

export const compileModuleForClient = async (
  source: string,
  id: string,
  options?: {
    hmr?: boolean;
  },
) => {
  const filePath = stripQuery(id);
  const analyzed = await loadAnalyzedModule(filePath, source);
  return compileClientModule(analyzed.code, filePath, {
    hmr: options?.hmr ?? false,
  });
};

export const compileModuleForSSR = async (source: string, id: string) => {
  const filePath = stripQuery(id);
  const analyzed = await loadAnalyzedModule(filePath, source);
  return compileSSRModule(analyzed.code, filePath);
};

export const loadSymbolModuleForClient = async (id: string) => {
  const parsed = parseSymbolRequest(id);
  if (!parsed) {
    return null;
  }

  const analyzed = await loadAnalyzedModule(parsed.filePath);
  const symbol = analyzed.symbols.get(parsed.symbolId);
  if (!symbol) {
    throw new Error(`Unknown resume symbol ${parsed.symbolId} for ${parsed.filePath}.`);
  }

  return compileClientModule(symbol.code, `${parsed.filePath}?${SYMBOL_QUERY}=${parsed.symbolId}`, {
    hmr: false,
  });
};

export const loadSymbolModuleForSSR = async (id: string) => {
  const parsed = parseSymbolRequest(id);
  if (!parsed) {
    return null;
  }

  const analyzed = await loadAnalyzedModule(parsed.filePath);
  const symbol = analyzed.symbols.get(parsed.symbolId);
  if (!symbol) {
    throw new Error(`Unknown resume symbol ${parsed.symbolId} for ${parsed.filePath}.`);
  }

  return compileSSRModule(symbol.code, `${parsed.filePath}?${SYMBOL_QUERY}=${parsed.symbolId}`);
};

export const createDevSymbolUrl = (root: string, filePath: string, symbolId: string) =>
  `/${path.relative(root, filePath).replaceAll("\\", "/")}?${SYMBOL_QUERY}=${symbolId}`;

export const createBuildSymbolUrl = (symbolId: string) => `/entries/symbol__${symbolId}.js`;

export const collectAppSymbols = async (root: string): Promise<ResumeSymbol[]> => {
  const appDir = path.join(root, "app");
  const files = await fg(path.join(appDir, "**/*.tsx").replaceAll("\\", "/"));
  const result: ResumeSymbol[] = [];

  for (const filePath of files) {
    const analyzed = await loadAnalyzedModule(filePath);
    result.push(...analyzed.symbols.values());
  }

  return result;
};
