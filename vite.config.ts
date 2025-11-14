import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';

export default defineConfig({
    root: path.resolve(__dirname, 'ui'),
    plugins: [wasm(), topLevelAwait()],
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:4001'
        }
    },
    build: {
        // Output inside the UI root (ui/dist) so Apache DocumentRoot /var/www/midnight-tickets/ui/dist works
        outDir: 'dist',
        emptyOutDir: true
    },
    optimizeDeps: {
        // Midnight libs may ship WASM; avoid pre-bundling issues during dev
        exclude: ['@midnight-ntwrk/ledger', '@midnight-ntwrk/zswap', '@midnight-ntwrk/midnight-js-types']
    }
});
