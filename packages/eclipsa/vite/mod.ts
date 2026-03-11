import {
  createServerModuleRunner,
  type Plugin,
  type PluginOption,
  type ResolvedConfig,
} from "vite";
import { createDevFetch } from "./dev-app/mod.ts";
import {
  incomingMessageToRequest,
  responseForServerResponse,
} from "../utils/node-connect.ts";
import { createConfig } from "./config.ts";
import {
  compileModuleForClient,
  compileModuleForSSR,
  loadSymbolModuleForClient,
  loadSymbolModuleForSSR,
  parseSymbolRequest,
  resolveResumeHmrUpdate,
} from "./compiler.ts";
import { RESUME_HMR_EVENT } from "../core/resume-hmr.ts";

const eclipsaCore = (): Plugin => {
  let config: ResolvedConfig;

  return {
    name: "vite-plugin-eclipsa",
    config: createConfig,
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    configureServer(server) {
      const ssrEnv = server.environments.ssr;
      const runner = createServerModuleRunner(ssrEnv, {
        hmr: false,
      });
      const devFetch = createDevFetch({
        resolvedConfig: config,
        devServer: server,
        runner,
        ssrEnv,
      });
      server.middlewares.use(async (req, res, next) => {
        const webReq = incomingMessageToRequest(req);
        const webRes = await devFetch(webReq);
        if (webRes) {
          responseForServerResponse(webRes, res);
          return;
        }
        next();
      });
    },
    async hotUpdate(options) {
      if (this.environment.name !== "client") {
        return;
      }
      if (!options.file.endsWith(".tsx")) {
        return;
      }
      const source = await options.read();
      const resumableUpdate = await resolveResumeHmrUpdate({
        filePath: options.file,
        root: config.root,
        source,
      });
      if (resumableUpdate.isResumable) {
        if (resumableUpdate.update) {
          this.environment.hot.send(RESUME_HMR_EVENT, resumableUpdate.update);
        }
        return [];
      }

      const module =
        options.modules[0] ??
        [...(this.environment.moduleGraph?.getModulesByFile(options.file) ?? [])][0];
      if (!module) {
        return;
      }
      this.environment.hot.send("update-client", {
        url: module.url,
      });
      return [];
    },
    async load(id) {
      if (!parseSymbolRequest(id)) {
        return null;
      }
      return this.environment.name === "client" ? loadSymbolModuleForClient(id) : loadSymbolModuleForSSR(id);
    },
    async transform(code, id) {
      if (!id.endsWith(".tsx") || parseSymbolRequest(id)) {
        return;
      }
      const isClient = this.environment.name === "client";
      return {
        code: isClient
          ? await compileModuleForClient(code, id, {
              hmr: !config.isProduction,
            })
          : await compileModuleForSSR(code, id),
      };
    },
  };
};

export const eclipsa = (): PluginOption => [eclipsaCore()];
