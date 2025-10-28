import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'electron/main.ts'),
      name: 'DelcoMusicElectronMain',
      fileName: () => 'main.js',
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
