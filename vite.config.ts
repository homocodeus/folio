import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tauriConfig from './src-tauri/tauri.conf.json';

export default defineConfig({ plugins: [react()], clearScreen: false, server: { port: 1420, strictPort: true }, preview: { port: 1420, strictPort: true, headers: { 'Content-Security-Policy': tauriConfig.app.security.csp } }, envPrefix: ['VITE_', 'TAURI_ENV_'], build: { target: 'es2022' } });
