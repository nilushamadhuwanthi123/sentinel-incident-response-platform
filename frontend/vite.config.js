import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    // Engines are pure logic and carry the project's correctness burden,
    // so they are held to a higher coverage bar than presentational code.
    coverage: { include: ['src/engines/**'] },
  },
});
