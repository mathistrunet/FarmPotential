import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

console.log('Starting Vite dev server and weather API...');

// 1) Lancer Vite en mode dev
const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell: true });

// 2) Lancer l’API Node avec conversion Windows → file:// URL
const serverEntryUrl = pathToFileURL(resolve('server/src/index.js')).href;
try {
  await import(serverEntryUrl);
} catch (err) {
  console.error('Failed to start API:', err);
  process.exitCode = 1;
}

// Propage le signal Ctrl+C
process.on('SIGINT', () => {
  vite.kill('SIGINT');
  process.exit(0);
});
