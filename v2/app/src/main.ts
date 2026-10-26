/**
 * The app's entry (index.html): logger first, then the start screen or the chosen mode. The
 * Android shell is told the app booted once it is mounted — except in TV mode, which signals
 * itself after its own boot (storage, last game), so a bundle that breaks there gets rolled back.
 */
import { mount } from 'svelte';
import { appConfig } from './lib/config.ts';
import { forwardShellLogs, log } from './lib/log.ts';
import { markShellReady, shellInfo } from './lib/shell.ts';
import { registerServiceWorker } from './lib/pwa.ts';
import App from './App.svelte';

import.meta.glob('./lib/ui/styles.css', { eager: true });

const config = appConfig();
forwardShellLogs();
log.info('lifecycle', 'Boot', {
  mode: config.mode, server: config.serverUrl, table: config.tableId, shell: shellInfo()?.shellVersion ?? null,
  ua: navigator.userAgent, screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
});

const target = document.getElementById('app');
if (!target) throw new Error('index.html has no #app');
mount(App, { target, props: { config } });
if (config.mode !== 'tv') markShellReady();
registerServiceWorker({ mode: config.mode, inShell: shellInfo() !== null, production: import.meta.env.PROD, supported: 'serviceWorker' in navigator && isSecureContext }, log, import.meta.env.BASE_URL);
