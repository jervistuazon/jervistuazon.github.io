import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Preview the production artifact with the same folder-relative asset paths.
export default defineConfig({
    root: fileURLToPath(new URL('../dist/presentation/site_feasibility/', import.meta.url)),
    appType: 'mpa',
    resolve: { alias: [
        { find: 'three/addons', replacement: fileURLToPath(new URL('../dist/presentation/site_feasibility/development/vendor/examples/jsm/', import.meta.url)) },
        { find: /^three$/, replacement: fileURLToPath(new URL('../dist/presentation/site_feasibility/development/vendor/three.module.js', import.meta.url)) }
    ] },
    server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
    optimizeDeps: { noDiscovery: true, include: [] }
});
