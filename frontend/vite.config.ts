import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const workspaceRoot = resolve(process.cwd(), '..')
  const env = loadEnv(mode, process.cwd(), '')
  const rootEnv = loadEnv(mode, workspaceRoot, '')
  const backendEnv = loadEnv(mode, resolve(workspaceRoot, 'backend'), '')

  const googleClientId =
    env.VITE_GOOGLE_CLIENT_ID ||
    env.GOOGLE_CLIENT_ID ||
    rootEnv.GOOGLE_CLIENT_ID ||
    backendEnv.GOOGLE_CLIENT_ID ||
    ''

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
