import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return defineConfig({
    plugins: [react()],
    server: {
      port: Number(env.VITE_DEV_SERVER_PORT) || 5174,
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (path) => path,
        },
        '/socket.io': {
          target: env.VITE_API_BASE_URL || 'http://localhost:3001',
          ws: true,
          changeOrigin: true,
        },
      },
    },
  })
}

