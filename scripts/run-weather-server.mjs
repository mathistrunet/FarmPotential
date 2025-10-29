#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!process.env.TS_NODE_PROJECT) {
  process.env.TS_NODE_PROJECT = resolve(__dirname, '../tsconfig.server.json');
}

await import(pathToFileURL(resolve(__dirname, '../server/src/index.ts')).href);
