/**
 * Ficheiro de arranque para a Hostinger (hPanel → Node.js → Application startup file).
 * Exige a pasta dist/ gerada por `npm run build` e Node.js 22.
 */
await import('./dist/index.js')
