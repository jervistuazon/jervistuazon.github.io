import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function end(response, status, headers = {}) {
  response.writeHead(status, headers);
  response.end();
}

function pipeFile(request, response, filePath, start, endPosition, status, headers) {
  response.writeHead(status, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(filePath, { start, end: endPosition });
  response.on("close", () => stream.destroy());
  stream.on("error", (error) => {
    if (error.code !== "ECONNRESET" && error.code !== "ERR_STREAM_PREMATURE_CLOSE") {
      console.error(error);
    }
    response.destroy();
  });
  stream.pipe(response);
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    end(response, 405, { Allow: "GET, HEAD" });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  } catch {
    end(response, 400);
    return;
  }

  let filePath = path.resolve(repositoryRoot, `.${pathname}`);
  const relativePath = path.relative(repositoryRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    end(response, 403);
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    end(response, 404);
    return;
  }

  const { size } = statSync(filePath);
  const baseHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
    "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
  };
  const range = request.headers.range;

  if (!range) {
    pipeFile(request, response, filePath, 0, size - 1, 200, {
      ...baseHeaders,
      "Content-Length": size,
    });
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) {
    end(response, 416, { ...baseHeaders, "Content-Range": `bytes */${size}` });
    return;
  }

  const suffixLength = match[1] ? null : Number(match[2]);
  const start = suffixLength === null ? Number(match[1]) : Math.max(size - suffixLength, 0);
  const requestedEnd = match[2] && suffixLength === null ? Number(match[2]) : size - 1;
  const endPosition = Math.min(requestedEnd, size - 1);

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(endPosition) || start > endPosition || start >= size) {
    end(response, 416, { ...baseHeaders, "Content-Range": `bytes */${size}` });
    return;
  }

  pipeFile(request, response, filePath, start, endPosition, 206, {
    ...baseHeaders,
    "Content-Length": endPosition - start + 1,
    "Content-Range": `bytes ${start}-${endPosition}/${size}`,
  });
});

server.listen(port, host, () => {
  console.log(`Presentation server: http://${host}:${port}/presentation/cinematic_web_presentation/`);
  console.log("Press Ctrl+C to stop.");
});
