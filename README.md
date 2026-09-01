# DUX

App de desktop para orquestrar múltiplas sessões de agente (Claude Code, Codex, Ollama) e ferramentas auxiliares num único canvas com zoom/pan — em vez de alternar entre vários terminais/janelas manualmente. Cada sessão é um node de verdade (terminal com PTY real, navegador embutido, nota em disco, etc.), tudo renderizado ao vivo dentro do mesmo canvas.

Roda nativamente no Linux (empacotado via `electron-builder`, com auto-update pelo GitHub Releases) e também no Windows, onde os agentes rodam dentro do WSL.

## Como funciona

O app é dividido em duas metades que conversam por WebSocket local (porta `4577`):

```
┌────────────────────────────┐          ┌───────────────────────────────┐
│   Electron + Vue 3 + Vue Flow │  ws://  │   Bridge (Node.js)             │
│   (janela, canvas, nodes,    │◄───────► │   node-pty + ws + servidor MCP │
│   terminal via xterm.js)     │127.0.0.1 │   (spawna claude/codex por     │
│                               │  :4577   │   sessão, CRUD de notas, git)  │
└────────────────────────────┘          └───────────────────────────────┘
```

- **App (raiz do repo)**: Electron + Vue 3 + [Vue Flow](https://vueflow.dev/).
- **Bridge (`bridge/`)**: servidor Node que spawna um PTY real (`node-pty`) por sessão de agente, expõe CRUD + watch de notas/arquivos, status/diff de git, e um pequeno servidor HTTP (`/ask`) usado para mensagens entre agentes linkados.
- **Como o bridge sobe** (`src/main/index.js`): no Windows, o Electron sobe o bridge dentro do WSL via `wsl.exe` (distro fixa no código, `WSL_DISTRO = 'Debian'`, caminho hardcoded pra esta máquina de dev). No Linux (e macOS), o bridge roda como processo nativo local — o próprio binário do Electron é reaproveitado com `ELECTRON_RUN_AS_NODE=1`, sem depender de `node` estar no `PATH`. Em ambos os casos é o mesmo `bridge/server.js`, só muda como o processo é iniciado.
- **Agentes linkados**: conectar dois nodes por uma edge no canvas permite que um agente pergunte algo a outro diretamente — via injeção de texto no PTY receptor (`bridge/agentLink.js`) ou via a tool MCP `dux_ask` (`bridge/mcp-server.mjs`), que bloqueia até a resposta chegar. Linkar um agente a uma nota (`bridge/noteLink.js`) avisa o agente que aquele arquivo `.md` está disponível pra ler/editar direto no disco — útil pra compartilhar contexto entre sessões.

## Tipos de node

| Categoria | Node | Descrição |
|---|---|---|
| Agentes | Terminal WSL · Claude Code | Sessão interativa do Claude Code rodando dentro do WSL (Windows). |
| Agentes | Terminal · Claude Code | Sessão interativa do Claude Code rodando localmente no Linux. |
| Agentes | Terminal · Codex | Sessão interativa do Codex CLI rodando localmente no Linux. |
| Agentes | Ollama | Chat com um modelo rodando localmente via Ollama. |
| Ferramentas | Navegador | Uma página web dentro do canvas (preview do projeto). |
| Ferramentas | Git | Status e diff de um repositório, atualizado automaticamente. |
| Ferramentas | HTTP | Testa endpoints (método, headers, body, resposta) sem sair do canvas. |
| Mídia | Imagem | Imagem de referência no canvas (mockup, screenshot, print de bug). |
| Mídia | Nota | Arquivo `.md` real no disco, com editor rich-text; conecte agentes via edge pra compartilhar contexto. |
| Utilitários | Pomodoro | Timer de foco/pausa com ciclos automáticos e notificação. |

O registro fica em `src/renderer/src/nodeTypes/registry.js` — cada tipo entra com seu próprio componente de node, formulário de configurações, formulário de criação (opcional) e ícone.

## Funcionalidades

- **Canvas com zoom/pan** (Vue Flow), com controle de zoom customizado no rodapé.
- **Terminais com PTY real** (`xterm.js` + `node-pty`), reconectam automaticamente se caírem, com scroll fino/minimalista e copiar seleção via Ctrl+C / Ctrl+Shift+C.
- **Workspaces múltiplos**, persistidos localmente e sincronizados entre máquinas quando logado com conta Google (aba "Conta" nas configurações).
- **Colaboração em tempo real**: um workspace pode virar uma "Room" compartilhada (via `laravel-echo`/Pusher/Reverb) com presença de cursores ao vivo entre participantes.
- **Voz e sons**: leitura em voz das respostas do agente (TTS via Piper, vozes baixadas sob demanda), transcrição de voz pra texto (Whisper, modelo baixado no primeiro uso), e som de notificação configurável quando um agente termina de responder (só ativo com TTS desligado).
- **Tema escuro/claro**, fundo do canvas (pontos/linhas), snap magnético e estilo de conexão das edges — tudo configurável na sidebar de configurações.
- **Janela customizada**: frameless, cantos arredondados, botões de fechar/minimizar/maximizar estilo macOS.
- **Auto-update**: checa e baixa atualizações do GitHub Releases automaticamente na abertura do app (timeout de 6s pra nunca travar o startup sem internet).

## Limitações conhecidas

- **Seleção de texto no terminal fica imprecisa fora de 100% de zoom** — limitação de como o `xterm.js` calcula a posição do mouse (não tem noção do `transform: scale()` do canvas).
- **No Windows, o caminho do bridge e a distro do WSL são hardcoded** (`src/main/index.js`: `WSL_DISTRO = 'Debian'`, caminho `/mnt/c/Users/...`) — pensado pra rodar nesta máquina específica, ainda não é portável sem ajustar esses valores.

## Pré-requisitos

- **Linux**: `claude` (e/ou `codex`) instalado e no `PATH` do shell de login. Dependências nativas de runtime (já resolvidas no pacote `.pacman`): `ffmpeg`, `gtk3`, `nss`, `libnotify`, `libappindicator-gtk3`, entre outras — ver `pacman.depends` em `package.json`.
- **Windows**: WSL2 configurado (distro usada aqui: Debian) com `claude`/`codex` instalados dentro dele.
- **Build a partir do código-fonte** (não necessário se for só instalar o `.pacman`/`.deb`/`.rpm`): toolchain nativo pra compilar o `node-pty` (`gcc`, `g++`, `make`, `python3`).

## Rodando localmente

```bash
# 1. Dependências do app
npm install

# 2. Dependências do bridge (tem seu próprio package.json — node-pty precisa compilar nativo)
cd bridge && npm install && cd ..

# 3. Modo desenvolvimento
npm run dev
```

`npm run dev` já sobe o bridge automaticamente — não precisa rodar `bridge/server.js` manualmente.

### Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o app em modo desenvolvimento com hot-reload |
| `npm run build` | Builda main/preload/renderer pra produção (`out/`) |
| `npm run preview` | Roda o build de produção localmente |
| `npm run dist` | Builda e empacota (`electron-builder`) sem publicar |
| `npm run dist:publish` | Builda, empacota e publica no GitHub Releases |

## Estrutura do projeto

```
DUX/
├─ src/
│  ├─ main/index.js              # processo principal do Electron (janela, auto-update, sobe/derruba o bridge)
│  ├─ preload/index.js           # ponte segura pro renderer (controles da janela)
│  └─ renderer/src/
│     ├─ App.vue                 # layout raiz (titlebar + sidebar + canvas)
│     ├─ components/             # UI (titlebar, canvas, controles de zoom, modal, nodes)
│     │  ├─ nodeSettings/        # formulários de configuração por tipo de node
│     │  └─ nodeCreate/          # formulários de criação por tipo de node
│     ├─ nodeTypes/registry.js   # registro central dos tipos de node
│     ├─ store/                  # estado compartilhado (workspaces, tema, sidebar, TTS, room)
│     └─ lib/bridgeClient.js     # helper pra falar com o bridge
└─ bridge/
   ├─ server.js                  # servidor WebSocket + node-pty + CRUD de notas/git
   ├─ agentLink.js               # mensagens entre agentes linkados via edge
   ├─ noteLink.js                # avisa agentes quando uma nota é linkada
   ├─ ptyWrite.js                # helper de escrita serializada no PTY
   └─ mcp-server.mjs             # servidor MCP por sessão (tool `dux_ask`)
```

## Roadmap

- Tornar o caminho/distro do WSL configuráveis no Windows (hoje fixos pra uma máquina específica).
- Corrigir a seleção de texto no terminal fora de 100% de zoom.
- Novos tipos de node (ex: outros shells, projetos remotos via SSH).
