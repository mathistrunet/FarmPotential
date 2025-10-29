#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const viteBin = require.resolve('vite/bin/vite.js');
const tsNodeBin = require.resolve('ts-node/dist/bin.js');

const children = new Set();
let shuttingDown = false;
let exitCode = 0;

function register(child, name) {
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      shuttingDown = true;
      for (const other of children) {
        if (!other.killed) {
          other.kill(signal ?? 'SIGTERM');
        }
      }
    }
    if (typeof code === 'number' && code !== 0) {
      exitCode = exitCode || code;
    }
    if (!children.size) {
      process.exit(exitCode);
    }
  });
  child.on('error', (error) => {
    console.error(`Failed to start ${name}:`, error);
    shuttingDown = true;
    for (const other of children) {
      if (!other.killed) {
        other.kill('SIGTERM');
      }
    }
    process.exit(1);
  });
}

function run(commandArgs, name) {
  const child = spawn(process.execPath, commandArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
  register(child, name);
  return child;
}

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('Starting Vite dev server and weather API...');

run([tsNodeBin, '--project', 'tsconfig.server.json', 'server/src/index.ts'], 'weather-api');
run([viteBin, 'dev'], 'vite');
