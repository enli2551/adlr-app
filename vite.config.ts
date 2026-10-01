import { defineConfig, loadEnv } from 'vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

// App version for error reports = the Android versionName (single source of truth).
const appVersion = /versionNames+"([^"]+)"/.exec(readFileSync(new URL('./android/app/build.gradle', import.meta.url), 'utf8'))?.[1] ?? 'dev';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
const env = loadEnv(mode, process.cwd(), '');
// Source maps for readable error stack traces (Better Stack, Sentry-compatible upload).
// Only when the upload token is set (.env / CI secret); maps are uploaded, then deleted,
// so they never ship inside the app.
const uploadMaps = !!(env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT && env.SENTRY_URL);
return {
  plugins: [
    react(),
    ...(uploadMaps ? [sentryVitePlugin({
      org: env.SENTRY_ORG,
      project: env.SENTRY_PROJECT,
      url: env.SENTRY_URL,
      authToken: env.SENTRY_AUTH_TOKEN,
      release: { name: `adlr@${appVersion}` },
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      telemetry: false,
    })] : []),
  ],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react', '@capacitor/core', '@capacitor/local-notifications'],
  },
  build: {
    sourcemap: uploadMaps ? 'hidden' : false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
};
});
