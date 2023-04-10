import { defineConfig } from 'vitest/config'
import Vue from '@vitejs/plugin-vue'
import VueJsx from '@vitejs/plugin-vue-jsx'
export default defineConfig({
  plugins: [Vue(), VueJsx()],
  optimizeDeps: {
    disabled: true
  },
  test: {
    clearMocks: true,
    environment: 'jsdom',
    //setup 文件的路径。它们将运行在每个测试文件之前。
    setupFiles: ['./vitest.setup.ts'],
    transformMode: {
      web: [/\.[jt]sx$/]
    }
  }
})
