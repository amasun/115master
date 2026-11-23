import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { defineConfig } from 'vite'
import svgLoader from 'vite-svg-loader'
import { phosphorIconsPlugin } from '../plugins/phosphorIcons'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '../src'),
    },
  },
  optimizeDeps: {
    exclude: ['@libmedia/avplayer'],
  },
  plugins: [phosphorIconsPlugin(), vue(), vueJsx(), tailwindcss(), svgLoader()],
})
