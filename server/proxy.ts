import type { Connect, Plugin } from "vite";
import { handle } from "../api/fetch.ts";

/**
 * Mounts the /api/fetch passthrough on the Vite dev and preview servers so local
 * development behaves like the deployed Vercel function. The handler itself lives
 * in api/fetch.ts; this file only wires it up.
 */
const middleware: Connect.NextHandleFunction = (req, res, next) => {
  if (!req.url?.startsWith("/api/fetch")) return next();
  void handle(req, res);
};

export function corsProxy(): Plugin {
  return {
    name: "story-scraper-proxy",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}
