import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, extname, resolve, sep } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const distDirectory = resolve(currentDirectory, "dist");
const indexFile = resolve(distDirectory, "index.html");

const apiUpstream = new URL(
  process.env.API_UPSTREAM ?? "http://127.0.0.1:3000",
);
const port = Number.parseInt(process.env.PORT ?? "4173", 10);

validateApiUpstream(apiUpstream);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = createServer(async (request, response) => {
  if (!request.url || !request.method) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad Request");
    return;
  }

  let url;

  try {
    url = new URL(request.url, "http://127.0.0.1");
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad Request");
    return;
  }

  if (shouldProxyPath(url.pathname)) {
    proxyHttpRequest(request, response);
    return;
  }

  try {
    await serveClientRoute(url.pathname, request.method, response);
  } catch (error) {
    globalThis.console.error("Failed to serve client asset", error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal Server Error");
  }
});

server.on("upgrade", (request, socket, head) => {
  if (!request.url || !shouldProxyPath(readPathname(request.url))) {
    socket.destroy();
    return;
  }

  proxyUpgradeRequest(request, socket, head);
});

server.listen(port, "0.0.0.0", () => {
  globalThis.console.log(`Web service listening on port ${port}`);
  globalThis.console.log(
    `Proxying /api and /socket.io to ${apiUpstream.origin}`,
  );
});

function validateApiUpstream(upstream) {
  if (upstream.hostname.endsWith(".railway.internal") && !upstream.port) {
    throw new Error(
      "API_UPSTREAM points to a Railway private domain without an explicit port. Set PORT=3000 on the api service and API_UPSTREAM=http://${{sfdc-api.RAILWAY_PRIVATE_DOMAIN}}:${{sfdc-api.PORT}} on the web service.",
    );
  }
}

function shouldProxyPath(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/socket.io" ||
    pathname.startsWith("/socket.io/")
  );
}

function proxyHttpRequest(request, response) {
  const transport =
    apiUpstream.protocol === "https:" ? httpsRequest : httpRequest;
  const forwardedFor = request.socket.remoteAddress;
  const upstreamRequest = transport(
    {
      protocol: apiUpstream.protocol,
      hostname: apiUpstream.hostname,
      port: apiUpstream.port || undefined,
      method: request.method,
      path: request.url,
      headers: omitUndefinedHeaders({
        ...request.headers,
        host: apiUpstream.host,
        "x-forwarded-for": forwardedFor,
        "x-forwarded-host": request.headers.host,
        "x-forwarded-proto": request.headers["x-forwarded-proto"] ?? "http",
      }),
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        omitUndefinedHeaders(upstreamResponse.headers),
      );
      upstreamResponse.pipe(response);
    },
  );

  upstreamRequest.on("error", (error) => {
    globalThis.console.error("Failed to proxy HTTP request", error);

    if (response.headersSent) {
      response.destroy(error);
      return;
    }

    response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad Gateway");
  });

  request.pipe(upstreamRequest);
}

function proxyUpgradeRequest(request, socket, head) {
  const transport =
    apiUpstream.protocol === "https:" ? httpsRequest : httpRequest;
  const upstreamRequest = transport({
    protocol: apiUpstream.protocol,
    hostname: apiUpstream.hostname,
    port: apiUpstream.port || undefined,
    method: request.method,
    path: request.url,
    headers: omitUndefinedHeaders({
      ...request.headers,
      host: apiUpstream.host,
      connection: request.headers.connection ?? "Upgrade",
      upgrade: request.headers.upgrade ?? "websocket",
      "x-forwarded-for": request.socket.remoteAddress,
      "x-forwarded-host": request.headers.host,
      "x-forwarded-proto": request.headers["x-forwarded-proto"] ?? "http",
    }),
  });

  upstreamRequest.on(
    "upgrade",
    (upstreamResponse, upstreamSocket, upstreamHead) => {
      const statusCode = upstreamResponse.statusCode ?? 101;
      const statusMessage =
        upstreamResponse.statusMessage ?? "Switching Protocols";
      const responseHeaders = Object.entries(
        omitUndefinedHeaders(upstreamResponse.headers),
      )
        .flatMap(([key, value]) => {
          if (Array.isArray(value)) {
            return value.map((item) => `${key}: ${item}`);
          }

          return `${key}: ${value}`;
        })
        .join("\r\n");

      socket.write(
        `HTTP/1.1 ${statusCode} ${statusMessage}\r\n${responseHeaders}\r\n\r\n`,
      );

      if (head.length > 0) {
        upstreamSocket.write(head);
      }

      if (upstreamHead.length > 0) {
        socket.write(upstreamHead);
      }

      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);
    },
  );

  upstreamRequest.on("response", (upstreamResponse) => {
    const statusCode = upstreamResponse.statusCode ?? 502;
    const statusMessage = upstreamResponse.statusMessage ?? "Bad Gateway";
    socket.write(`HTTP/1.1 ${statusCode} ${statusMessage}\r\n\r\n`);
    upstreamResponse.resume();
    socket.destroy();
  });

  upstreamRequest.on("error", (error) => {
    globalThis.console.error("Failed to proxy upgrade request", error);
    socket.destroy(error);
  });

  socket.on("error", () => {
    upstreamRequest.destroy();
  });

  upstreamRequest.end();
}

async function serveClientRoute(pathname, method, response) {
  const assetPath = await resolveAssetPath(pathname);

  if (!assetPath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  const assetStats = await stat(assetPath);
  const extension = extname(assetPath);
  const isHtml = extension === ".html";

  response.writeHead(200, {
    "Cache-Control": isHtml
      ? "no-cache"
      : "public, max-age=31536000, immutable",
    "Content-Length": String(assetStats.size),
    "Content-Type": contentTypes[extension] ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });

  if (method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(assetPath).pipe(response);
}

async function resolveAssetPath(pathname) {
  if (pathname === "/") {
    return indexFile;
  }

  const decodedPath = decodeURIComponent(pathname);
  const candidate = resolve(distDirectory, `.${decodedPath}`);

  if (isInsideDistDirectory(candidate)) {
    try {
      const candidateStats = await stat(candidate);

      if (candidateStats.isFile()) {
        return candidate;
      }
    } catch {
      return extname(candidate) ? null : indexFile;
    }
  }

  return extname(candidate) ? null : indexFile;
}

function isInsideDistDirectory(candidatePath) {
  return (
    candidatePath === distDirectory ||
    candidatePath.startsWith(`${distDirectory}${sep}`)
  );
}

function readPathname(value) {
  try {
    return new URL(value, "http://127.0.0.1").pathname;
  } catch {
    return "";
  }
}

function omitUndefinedHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value !== undefined),
  );
}
