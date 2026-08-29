import { resolve } from 'path'
import { copyFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// electron-vite só empacota o que o bundler referencia por import; splash.html
// é carregado em runtime via loadFile(), então precisa ser copiado manualmente
// pra out/main — sem isso, o build de produção (dist) sobe com o arquivo
// faltando dentro do asar (funciona em `npm run dev` porque o splash só roda
// quando app.isPackaged é true).
//
// icon.png segue junto pelo mesmo motivo: build/ nunca entra em "files" do
// package.json (só é fonte pro ícone do instalador, não asset de runtime), e
// splash.html referencia ../../build/icon.png — sem essa cópia, esse path
// aponta pra um arquivo que não existe dentro do pacote publicado, e a logo
// simplesmente não aparece na tela de "verificando atualizações".
function copySplashAssetsPlugin() {
  return {
    name: 'copy-splash-assets',
    writeBundle() {
      copyFileSync(
        resolve(__dirname, 'src/main/splash.html'),
        resolve(__dirname, 'out/main/splash.html')
      )
      copyFileSync(resolve(__dirname, 'build/icon.png'), resolve(__dirname, 'out/main/icon.png'))
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copySplashAssetsPlugin()]
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
