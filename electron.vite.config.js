import { resolve } from 'path'
import { copyFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// electron-vite só empacota o que o bundler referencia por import; splash.html
// é carregado em runtime via loadFile(), então precisa ser copiado manualmente
// pra out/main — sem isso, o build de produção (dist) sobe com o arquivo
// faltando dentro do asar (funciona em `npm run dev` porque o splash só roda
// quando app.isPackaged é true).
function copySplashHtmlPlugin() {
  return {
    name: 'copy-splash-html',
    writeBundle() {
      copyFileSync(
        resolve(__dirname, 'src/main/splash.html'),
        resolve(__dirname, 'out/main/splash.html')
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copySplashHtmlPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag === 'webview'
          }
        }
      })
    ]
  }
})
