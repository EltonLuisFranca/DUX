# DUX Fleet

App de desktop (Windows) para visualizar e interagir com múltiplas sessões do [Claude Code](https://claude.com/claude-code) rodando dentro do WSL, cada uma como um node num canvas com zoom/pan — em vez de alternar entre vários terminais/janelas manualmente.

Cada node é um terminal de verdade (PTY), renderizado ao vivo dentro do canvas, onde dá pra digitar e interagir normalmente com o Claude Code.

## Como funciona

O projeto é dividido em duas metades que rodam em sistemas diferentes e conversam por WebSocket local:

```
┌─────────────────────────────┐          ┌──────────────────────────────┐
│   Windows (processo nativo)   │          │   WSL / Linux (processo nativo) │
│                               │          │                                │
│   Electron + Vue 3 + Vue Flow│  ws://    │   Node.js + node-pty + ws     │
│   (janela, canvas, nodes,    │◄────────► │   (spawna `claude` via PTY,   │
│   terminal via xterm.js)     │ 127.0.0.1 │   um processo por sessão)     │
│                               │  :4577    │                                │
└─────────────────────────────┘          └──────────────────────────────┘
```

- **App (raiz do repo)**: Electron + Vue 3 + [Vue Flow](https://vueflow.dev/) rodando como processo Windows nativo (precisa disso pra abrir como janela de verdade — dentro do WSL/WSLg ele só cai pro fallback de servir via navegador).
- **Bridge (`bridge/`)**: um servidor Node pequeno que roda *dentro do WSL*. Ele existe porque o Claude Code é uma CLI interativa (usa terminal em modo raw, cursor, cores) — pra renderizar isso de verdade é preciso um PTY real, e a lib que faz isso (`node-pty`) precisa ser compilada pro sistema operacional onde o processo (`claude`) de fato roda, ou seja, Linux/WSL.
- O Electron sobe o bridge automaticamente (via `wsl.exe`) quando o app inicia, e cada node do tipo "Terminal WSL · Claude Code" abre sua própria conexão WebSocket com o bridge, que por sua vez spawna um `claude` isolado por sessão.

## Funcionalidades

- **Canvas com zoom/pan** (Vue Flow), com controle de zoom customizado no rodapé (zoom in/out, seletor de porcentagem, ajustar à tela).
- **Node de terminal WSL + Claude Code**: PTY real embutido via `xterm.js`, reconecta automaticamente se cair.
- **Adicionar node**: modal com busca, ícone por tipo, e formulário de criação que valida o diretório do WSL antes de criar (evita nodes apontando pra pasta inexistente).
- **Configurações por node**: sidebar redimensionável (arraste a borda) com atalho `Ctrl+B` pra fechar. Permite renomear o node e trocar o diretório do WSL — ao salvar um diretório válido, a sessão é reiniciada automaticamente nesse novo diretório.
- **Tema escuro/claro**: toggle no titlebar, escuro é o padrão; tema persiste entre sessões (`localStorage`).
- **Janela customizada**: frameless, cantos arredondados, botões de fechar/minimizar/maximizar estilo macOS (posicionados à direita, ordem Windows).
- **Registro de tipos de node extensível** (`src/renderer/src/nodeTypes/registry.js`): hoje só existe o tipo `wsl-claude-terminal`, mas o sistema já foi feito pra crescer — cada tipo novo entra com seu próprio componente de node, formulário de configurações, formulário de criação (opcional) e ícone.

## Limitações conhecidas

- **Seleção de texto no terminal fica imprecisa fora de 100% de zoom.** É uma limitação de como o `xterm.js` calcula a posição do mouse (não tem noção do `transform: scale()` do canvas). Em 100% funciona perfeitamente.
- **Só roda em modo desenvolvimento** (`npm run dev`) por enquanto — ainda não foi empacotado com `electron-builder` pra gerar um `.exe` distribuível.
- **Caminhos e distro do WSL fixos no código** (`src/main/index.js`: `WSL_DISTRO = 'Debian'`, caminho do bridge) — pensado pra rodar nesta máquina específica, ainda não é portável pra outro ambiente sem ajustar esses valores.
- **Estado do canvas não persiste entre reinícios do app** — os nodes ficam em memória (`src/renderer/src/store/flowStore.js`); fechar o app reseta pro node inicial.

## Pré-requisitos

- Windows 10/11 com **WSL2** configurado (distro usada aqui: Debian).
- **Node.js** instalado nativamente no Windows *e* dentro do WSL.
- **Claude Code CLI** instalado e configurado dentro do WSL (`claude` precisa estar no `PATH` do shell de login).
- Dependências nativas de build no WSL pra compilar o `node-pty` (`gcc`, `g++`, `make`, `python3` — geralmente já vêm com o Debian/Ubuntu no WSL).

## Rodando localmente

```bash
# 1. Instalar dependências do app (Windows, PowerShell/cmd)
npm install

# 2. Instalar dependências do bridge (dentro do WSL, mesmo caminho via /mnt/c/...)
cd bridge && npm install

# 3. Rodar em modo desenvolvimento (Windows)
npm run dev
```

O `npm run dev` builda o app e já sobe o bridge automaticamente dentro do WSL — não precisa rodar o bridge manualmente.

### Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o app em modo desenvolvimento com hot-reload |
| `npm run build` | Builda main/preload/renderer pra produção (`out/`) |
| `npm run preview` | Roda o build de produção localmente |

## Estrutura do projeto

```
dux-fleet/
├─ src/
│  ├─ main/index.js              # processo principal do Electron (janela, sobe/derruba o bridge)
│  ├─ preload/index.js           # ponte segura pro renderer (controles da janela)
│  └─ renderer/src/
│     ├─ App.vue                 # layout raiz (titlebar + sidebar + canvas)
│     ├─ components/             # UI (titlebar, canvas, controles de zoom, modal, node)
│     │  ├─ nodeSettings/        # formulários de configuração por tipo de node
│     │  └─ nodeCreate/          # formulários de criação por tipo de node
│     ├─ nodeTypes/registry.js   # registro central dos tipos de node
│     ├─ store/                  # estado compartilhado (nodes/edges, tema, sidebar)
│     └─ lib/bridgeClient.js     # helper pra falar com o bridge (ex: validar caminho)
└─ bridge/
   └─ server.js                  # servidor WebSocket + node-pty, roda dentro do WSL
```

## Roadmap

- Empacotar com `electron-builder` pra gerar um instalador `.exe`.
- Persistir o layout do canvas entre sessões.
- Tornar a distro do WSL e os caminhos configuráveis (hoje fixos pra esta máquina).
- Novos tipos de node (ex: outros shells, projetos remotos via SSH).
