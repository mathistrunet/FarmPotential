#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const vitePackageJson = require.resolve('vite/package.json');
const viteBin = path.join(path.dirname(vitePackageJson), 'bin', 'vite.js');
const tsNodeLoader = require.resolve('ts-node/esm');
const weatherServerScript = path.join(process.cwd(), 'scripts', 'run-weather-server.mjs');

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

run(['--loader', tsNodeLoader, weatherServerScript], 'weather-api');
run([viteBin, 'dev'], 'vite');
