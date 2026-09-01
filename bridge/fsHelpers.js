const fs = require('fs')
const os = require('os')
const path = require('path')

const HOME = os.homedir()

function resolveCwd(input) {
  const raw = input && input.trim() ? input.trim() : '~'
  const expanded = raw === '~' || raw.startsWith('~/') ? path.join(HOME, raw.slice(1)) : raw
  return path.resolve(HOME, expanded)
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

function listSubdirectories(target) {
  try {
    return fs
      .readdirSync(target, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

function isFile(target) {
  try {
    return fs.statSync(target).isFile()
  } catch {
    return false
  }
}

// diferente de listSubdirectories (só diretórios, usado pro autocomplete de
// path de criação de node) — aqui lista arquivos E diretórios, pra tool
// list_files do Ollama explorar uma pasta antes de decidir o que abrir
function listDirEntries(target) {
  try {
    return fs
      .readdirSync(target, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

module.exports = { resolveCwd, isDirectory, isFile, listSubdirectories, listDirEntries }
