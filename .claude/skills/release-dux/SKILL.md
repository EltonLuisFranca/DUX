---
name: release-dux
description: Publica uma nova release do DUX (build Windows via electron-builder + upload pro GitHub). Use quando o usuário pedir para "subir novo build", "publicar release", "fazer o release", ou similar neste projeto.
---

Este projeto (`dux-fleet`, repo `EltonLuisFranca/DUX`) roda em WSL, mas o
build de distribuição precisa ser feito no lado **Windows** (via `cmd.exe`
por interop) porque o instalador é NSIS. O ambiente tem uma série de
armadilhas conhecidas — siga os passos na ordem.

## 0. Pré-requisitos que já devem estar prontos

- `gh auth status` autenticado com escopo `repo`.
- O repositório **precisa ser público** (`gh repo view EltonLuisFranca/DUX --json visibility`).
  Repo privado faz o `electron-updater` do app instalado receber 404 em
  qualquer download anônimo de asset — o auto-update simplesmente não
  funciona em silêncio. Se estiver privado: `gh repo edit EltonLuisFranca/DUX --visibility public`
  (antes disso, rode uma varredura por segredos no histórico — veja passo 6).

## 1. Só suba versão se houver commits novos

```bash
git log --oneline -5
git status --short
```

Se não há nada novo desde a última tag de release, pergunte ao usuário se
ele realmente quer gerar um build idêntico, ou se esqueceu de commitar algo.

## 2. Bump de versão

Edite `package.json`, campo `version` (semver simples, ex: `1.0.1` → `1.0.2`).
Depois:

```bash
git add package.json
git commit -m "Bump version to X.Y.Z"
git fetch origin && git rev-list --left-right --count HEAD...origin/main  # confirma "N	0" antes de dar push
git push origin main
```

## 3. Build + publish no Windows via interop

**Nunca** rode o build a partir do WSL puro — o instalador é NSIS
(Windows-only) e o `node_modules` fica inconsistente entre os dois lados
(veja Gotchas). O caminho certo:

```bash
GH_TOKEN=$(gh auth token)
cmd.exe /c "set ELECTRON_RUN_AS_NODE=&& set GH_TOKEN=$GH_TOKEN&& cd /d C:\Users\57224\dux-fleet && npm install" \
  > /tmp/win-install.log 2>&1 &
```

Espere esse `npm install` terminar de verdade (monitore o PID do
`cmd.exe`, não confie no "completed" da notificação de background — ela
dispara assim que o `&` desanexa, não quando o processo real termina).
Depois:

```bash
GH_TOKEN=$(gh auth token)
cmd.exe /c "set ELECTRON_RUN_AS_NODE=&& set GH_TOKEN=$GH_TOKEN&& cd /d C:\Users\57224\dux-fleet && npm run dist:publish" \
  > /tmp/win-publish.log 2>&1 &
```

Isso builda **e** publica no GitHub Releases automaticamente (o
`electron-builder` cuida do upload usando `GH_TOKEN`). Monitore o PID real
do `cmd.exe`, não o disparo do background.

**Tempo esperado: 15–30 minutos.** Este ambiente tem antivírus corporativo
e signing (`signtool.exe` com timestamp remoto) que tornam cada etapa bem
mais lenta que o normal. Não interrompa cedo demais — confirme que o
processo real (`ps -ef | grep "cmd.exe.*dist:publish"`) morreu antes de
declarar sucesso ou falha.

## 4. Verificar a release publicada (sempre, sem exceção)

O `electron-builder --publish` às vezes **cria releases duplicadas em
draft** por race condition (cada asset upload tenta criar a release se
ela ainda não existir, e paralelismo pode gerar duas). Sempre confira:

```bash
gh release list --repo EltonLuisFranca/DUX
```

Se aparecer a mesma tag duas vezes como `Draft`:

```bash
gh api repos/EltonLuisFranca/DUX/releases -q '.[] | select(.tag_name == "vX.Y.Z") | {id, draft, assets: [.assets[].name]}'
```

Mantenha a que tiver `DUX-Setup-X.Y.Z.exe` + `.blockmap` + `latest.yml`
completos, apague a outra:

```bash
gh api -X DELETE repos/EltonLuisFranca/DUX/releases/<id-da-incompleta>
```

E publique a correta (tire do draft):

```bash
gh api -X PATCH repos/EltonLuisFranca/DUX/releases/<id-da-completa> \
  -f draft=false -f name="DUX vX.Y.Z" -f body="<notas da release>"
```

**Passo crítico, não pule:** publicar uma release que estava em draft via
PATCH **não recalcula automaticamente qual release é "Latest"** — o
GitHub às vezes mantém a marca "Latest" numa release bem mais antiga (já
vimos isso deixar a v1.0.1 marcada como Latest com v1.0.3 já publicada).
Como o `electron-updater` consulta exatamente esse endpoint
(`/releases/latest`) para checar updates, isso faz o app **nunca
detectar a versão nova**, sem erro nenhum visível. Sempre confirme e
force se necessário:

```bash
gh api repos/EltonLuisFranca/DUX/releases/latest -q '.tag_name'
# se não for a versão que você acabou de publicar:
gh api -X PATCH repos/EltonLuisFranca/DUX/releases/<id-da-completa> -f make_latest=true
```

## 5. Confirmar que os assets estão acessíveis de verdade

Não confie só no `gh release view` — teste o download anônimo real, que é
o que o `electron-updater` do app instalado faz:

```bash
curl -sL -o /dev/null -w "%{http_code}\n" \
  "https://github.com/EltonLuisFranca/DUX/releases/download/vX.Y.Z/latest.yml"
```

Espera-se `200`. Se vier `404` logo após publicar, é só delay de
propagação do CDN — espere alguns minutos e tente de novo (não é sinal de
erro se a release já está confirmadamente fora de draft e pública).

Confira também que o `latest.yml` referencia o nome exato do asset que o
GitHub gerou (ele **substitui espaços por pontos ou hífens** de forma
inconsistente dependendo de como o upload foi feito — manual via `gh
release create` vira ponto, `electron-builder` normaliza para hífen). Se
algum dia precisar subir um asset manualmente, confirme o nome real via
`gh release view vX.Y.Z --json assets -q '.assets[].name'` **antes** de
montar/editar o `latest.yml` à mão.

## 6. Varredura de segredos (só na primeira vez que tornar público, ou se desconfiar)

```bash
git log --all -p 2>/dev/null | grep -iE "(api[_-]?key|secret|password|bearer\s+[a-z0-9]|sk-[a-z0-9]{10,})"
```

Revise manualmente os hits — não são todos positivos reais (o node Ollama
deste projeto tem um campo de UI chamado literalmente "token", isso não é
um segredo vazado).

## Gotchas deste ambiente (não pule, todos já causaram builds falhos)

- **`ELECTRON_RUN_AS_NODE=1`** vem setado no ambiente do harness. Rodar
  `electron` ou `npm run dev`/`dist` sem `env -u ELECTRON_RUN_AS_NODE`
  (no WSL) ou `set ELECTRON_RUN_AS_NODE=` (no `cmd.exe`) faz o Electron
  rodar como Node puro — `electron.app` vem `undefined` e o main process
  crasha na primeira linha que usa `app.getPath(...)`.
- **`node_modules` é uma pasta física compartilhada** entre WSL e
  Windows (`/mnt/c/Users/57224/dux-fleet` = `C:\Users\57224\dux-fleet`).
  Rodar `npm install` de um lado sobrescreve os binários nativos do
  outro (rollup, electron, node-pty). Sempre que trocar de lado, reinstale
  antes de tentar rodar/buildar — não assuma que o `node_modules` está
  bom só porque existe.
- **O binário do Electron não baixa sozinho** neste ambiente WSL após
  `npm install` — rode manualmente: `node node_modules/electron/install.js`.
- **`rm -rf node_modules` é extremamente lento** no filesystem `/mnt/c`
  (WSL sobre drvfs/9p) — pode levar 15+ minutos para uma pasta de
  ~300MB. Prefira `mv node_modules node_modules_trash_$(date +%s) &&
  rm -rf node_modules_trash_* &` (em background) e rode o `npm install`
  imediatamente, sem esperar o `rm` real terminar.
- **`productName` não pode ter espaço** de forma prática — mesmo
  escapado, o GitHub Releases normaliza nomes de asset trocando espaços
  por `.` ou `-` de forma inconsistente entre uploads manuais e
  automáticos, e isso já quebrou o `latest.yml` do `electron-updater`
  mais de uma vez. O produto se chama `DUX` (sem sufixo) por causa
  exatamente disso.
- **Repo privado quebra o auto-update silenciosamente** — nenhum erro
  aparece no app, o `electron-updater` só nunca acha nada (404 anônimo).
  Sempre confirme `visibility: PUBLIC` antes de investigar qualquer outra
  coisa se o auto-update "não fizer nada".
