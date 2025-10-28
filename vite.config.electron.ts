import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        main: resolve(__dirname, 'electron/main.ts'),
        preload: resolve(__dirname, 'electron/preload.ts'),
      },
      name: 'DelcoMusicElectron',
      formats: ['cjs'],
    },
    outDir: 'dist/electron',
    rollupOptions: {
      external: ['electron'],
      output: {
        entryFileNames: '[name].js',
        format: 'cjs',
      },
    },
    minify: false,
    target: 'node18',
  },
});
