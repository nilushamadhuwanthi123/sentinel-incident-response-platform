import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // React ships separate development and production builds, and the export
  // condition is chosen from NODE_ENV. On a machine where NODE_ENV is
  // already 'production' in the shell, Vitest inherits it, React resolves
  // to the production build, and every component test fails with
  // "act(...) is not supported in production builds of React" — an error
  // that says nothing about the actual cause. Pinning it for the test mode
  // only leaves `npm run build` producing a real production bundle.
  if (mode === 'test') process.env.NODE_ENV = 'test';

  return {
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
  };
});
