import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.{js,ts}'],
    // These tests share one Docker daemon and start real containers. Running
    // files in parallel starves them and trips the 5s default timeout.
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
