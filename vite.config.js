import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig(() => {
  return {
    server: {
      open: true,
    },
    plugins: [
      react(),
      nodePolyfills({
        protocolImports: true,
      }),
    ],
  }
})
