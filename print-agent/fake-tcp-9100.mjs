import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const agentDir = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.AARD_FAKE_PRINTER_PORT ?? 9100);
const host = process.env.AARD_FAKE_PRINTER_HOST ?? '127.0.0.1';
const captureDir = join(agentDir, 'captures');

mkdirSync(captureDir, { recursive: true });

const server = createServer((socket) => {
  const chunks = [];
  socket.on('data', (chunk) => chunks.push(chunk));
  socket.on('end', () => {
    const payload = Buffer.concat(chunks).toString('utf8');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = join(captureDir, `${stamp}.zpl`);
    writeFileSync(filePath, payload, 'utf8');
    const ok = payload.trim().startsWith('^XA') && payload.trim().endsWith('^XZ');
    console.log(`[fake-printer] captured ${Buffer.byteLength(payload, 'utf8')} bytes -> ${filePath} ${ok ? 'OK' : 'INVALID'}`);
  });
});

server.listen(port, host, () => {
  console.log(`[fake-printer] listening on ${host}:${port}`);
  console.log(`[fake-printer] set printer mapping to TCP_9100 ${host}:${port}`);
});
