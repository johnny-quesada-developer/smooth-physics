// Serves the built site over HTTPS on the local network, for phones. Any device on the network can open it.
// Usage: vpx scripts/serve-lan.ts --cert server.pem --key server.key [--port 8460] [--host 0.0.0.0] [--root dist] [--http redirect|serve]
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createServer as createTcpServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const { values } = parseArgs({
  options: {
    cert: { type: 'string' },
    key: { type: 'string' },
    port: { type: 'string', default: '8460' },
    host: { type: 'string', default: '0.0.0.0' },
    root: { type: 'string', default: 'dist' },
    // `serve` answers plain HTTP too: iOS Safari then runs without its optimizing JIT, which stands in for a slow phone.
    http: { type: 'string', default: 'redirect' },
  },
});
if (!values.cert || !values.key) throw new Error('--cert and --key are required.');
if (values.http !== 'redirect' && values.http !== 'serve') throw new Error('--http must be redirect or serve.');

const root = resolve(values.root);
const secure = createHttpsServer({ cert: readFileSync(values.cert), key: readFileSync(values.key) }, (request, response) => handle({ request, response }));
const plain = createHttpServer((request, response) => {
  if (values.http === 'serve') return handle({ request, response });
  response.writeHead(308, { Location: `https://${request.headers.host ?? `localhost:${values.port}`}${request.url ?? '/'}` }).end();
});
// Safari opens a typed bare address over plain HTTP. One port serves both: a TLS handshake starts with byte 0x16.
const server = createTcpServer((socket) => {
  socket.once('data', (chunk) => {
    socket.pause();
    socket.unshift(chunk);
    (chunk[0] === 0x16 ? secure : plain).emit('connection', socket);
    process.nextTick(() => socket.resume());
  });
});

server.listen(Number(values.port), values.host, () => {
  for (const address of lanAddresses()) console.info(`https://${address}:${values.port}/`);
});

function handle({ request, response }: { request: IncomingMessage; response: ServerResponse }): void {
  const url = new URL(request.url ?? '/', 'https://localhost');
  const file = fileFor(url.pathname);
  const status = file ? 200 : 404;
  const served = file ?? join(root, '404.html');
  response.writeHead(status, { 'Content-Type': CONTENT_TYPES[extname(served)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(served).pipe(response);
}

// A file inside the root: the path itself, or its index.html.
function fileFor(pathname: string): string | null {
  const target = resolve(join(root, decodeURIComponent(pathname)));
  if (target !== root && !target.startsWith(root + sep)) return null;
  for (const candidate of [target, join(target, 'index.html')]) if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}
