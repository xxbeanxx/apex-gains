/**
 * Custom production server, replacing `react-router-serve`.
 *
 * Azure Container Apps terminates TLS at its ingress and forwards plain
 * HTTP, setting X-Forwarded-Proto/X-Forwarded-Host. `react-router-serve`
 * never enables Express's "trust proxy" setting, so `req.protocol` (and
 * therefore the `request.url` React Router builds) is always "http" even
 * for real "https" requests. React Router's CSRF check on document
 * actions compares that origin against the browser's `Origin` header
 * (which is correctly "https"), so every form submission was rejected
 * with a 400. Enabling "trust proxy" makes Express (and so React Router)
 * derive the protocol/host from the forwarded headers instead.
 *
 * Otherwise this mirrors `@react-router/serve`'s CLI (asset serving,
 * compression, request logging) since that package doesn't expose a way
 * to configure "trust proxy" itself.
 */
import path from "node:path";
import url from "node:url";
import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import morgan from "morgan";
import type { ServerBuild } from "react-router";

const buildPath = path.resolve("build/server/index.js");
const build = (await import(
  url.pathToFileURL(buildPath).href
)) as ServerBuild;

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(compression());

// @react-router/express falls back to the raw `Host` header's port
// whenever `X-Forwarded-Host` doesn't specify one (see createRemixRequest
// in its source). Azure's ingress forwards an internal `Host` value that
// doesn't necessarily match `X-Forwarded-Host`, so that fallback can still
// produce a `request.url` with an unexpected port and trip the CSRF origin
// check above. Normalize `Host` to the forwarded value so both agree.
app.use((req, _res, next) => {
  const forwardedHost = req.get("X-Forwarded-Host");
  if (forwardedHost) {
    req.headers.host = forwardedHost;
  }
  next();
});

const assetsBuildDirectory = path.resolve(build.assetsBuildDirectory);
const publicPath = build.publicPath;

app.use(
  path.posix.join(publicPath, "assets"),
  express.static(path.join(assetsBuildDirectory, "assets"), {
    immutable: true,
    maxAge: "1y",
  }),
);
app.use(publicPath, express.static(assetsBuildDirectory));
app.use(express.static("public", { maxAge: "1h" }));
app.use(
  "/.well-known",
  express.static(path.join(assetsBuildDirectory, ".well-known")),
);
app.use(morgan("tiny"));

app.all(
  "/{*splat}",
  createRequestHandler({
    build,
    mode: process.env.NODE_ENV,
  }),
);

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST;
const server = host ? app.listen(port, host) : app.listen(port);
server.on("listening", () => {
  console.log(`[server] http://localhost:${port}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => server.close(console.error));
}
