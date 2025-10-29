#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!process.env.TS_NODE_PROJECT) {
  process.env.TS_NODE_PROJECT = resolve(__dirname, '../tsconfig.server.json');
}

await import('../server/src/index.ts');
