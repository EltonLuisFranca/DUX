---
name: release-dux
description: Publica uma nova release do DUX (build Linux e/ou Windows via electron-builder + upload pro GitHub). Use quando o usuário pedir para "subir novo build", "publicar release", "fazer o release", "release pro Windows", ou similar neste projeto.
---

Este projeto (`dux`, repo `EltonLuisFranca/DUX`) tem dois fluxos de build,
dependendo de qual máquina/ambiente está rodando este skill:

- **Máquina Linux pura (Arch, sem interop)**: build direto no shell, gera
  `pacman`/`deb`/`rpm`. Veja a seção "Release Linux" abaixo.
- **WSL2 com interop pro Windows** (ambiente típico deste Claude Code):
  dá pra fazer os dois a partir do mesmo shell — o build Linux roda direto
  no WSL, e o build Windows roda chamando `cmd.exe`/`powershell.exe` do
  Windows host via interop (sem precisar trocar de máquina). Veja a seção
  "Release Windows" abaixo.

A mesma tag/versão do `package.json` cobre ambas as plataformas — não
precisa bumpar versão duas vezes se já saiu um release Linux e agora só
falta gerar o instalador Windows (ou vice-versa). Sempre confira primeiro:

```bash
gh release view vX.Y.Z --repo EltonLuisFranca/DUX --json assets -q '.assets[].name'
```

Se já tem `.pacman`/`.deb`/`.rpm` mas falta `.exe`, ou vice-versa, é só
completar o que falta na mesma tag — sem bump, sem novo commit.

# Release Linux

O build de distribuição é feito direto aqui, sem interop com
Windows/WSL — o `package.json` já está configurado para gerar os targets
`pacman`, `deb` e `rpm` via `electron-builder`.

## 0. Pré-requisitos que já devem estar prontos

- `gh auth status` autenticado com escopo `repo`.
- O repositório **precisa ser público** (`gh repo view EltonLuisFranca/DUX --json visibility`).
  Repo privado faz o `electron-updater` do app instalado receber 404 em
  qualquer download anônimo de asset — o auto-update simplesmente não
  funciona em silêncio. Se estiver privado: `gh repo edit EltonLuisFranca/DUX --visibility public`
  (antes disso, rode uma varredura por segredos no histórico — veja passo 6).
- Ferramentas de empacotamento Linux instaladas — confira com
  `which makepkg fakeroot dpkg-deb rpmbuild`. Neste ambiente (Arch) só
  `makepkg`/`fakeroot` (target `pacman`) vêm de fábrica; `dpkg-deb`
  (target `deb`) e `rpmbuild` (target `rpm`) precisam ser instalados à
  parte (`pacman -S dpkg rpm-tools` no AUR/extra) ou removidos da lista
  `build.linux.target` do `package.json` se não forem necessários agora.

## 1. Só suba versão se houver commits novos

```bash
git log --oneline -5
git status --short
```

Se não há nada novo desde a última tag de release, pergunte ao usuário se
ele realmente quer gerar um build idêntico, ou se esqueceu de commitar algo.

## 2. Bump de versão

Edite `package.json`, campo `version` (semver simples, ex: `1.0.3` → `1.0.4`).
Edite também `installer/package.json` (mesmo campo `version`) para o mesmo
valor — é o que dá nome ao `.exe` do instalador customizado (ex: `Instalar
DUX X.Y.Z.exe`); se ficar dessincronizado, o nome do arquivo não bate com a
tag da release e fica confuso qual instalador corresponde a qual versão.
Depois:

```bash
git add package.json installer/package.json
git commit -m "Bump version to X.Y.Z"
git fetch origin && git rev-list --left-right --count HEAD...origin/main  # confirma "N	0" antes de dar push
git push origin main
```

## 3. Build + publish

Direto no shell, sem interop nenhum:

```bash
npm install   # garante node_modules consistente com este SO/arch
GH_TOKEN=$(gh auth token) npm run dist:publish
```

Isso builda os targets Linux configurados **e** publica no GitHub
Releases automaticamente (o `electron-builder` cuida do upload usando
`GH_TOKEN`). Rode em foreground ou monitore o processo real — não
declare sucesso só porque o comando retornou o prompt de volta se foi
disparado em background.

**Tempo esperado: poucos minutos** (bem mais rápido que o fluxo Windows
antigo — sem antivírus corporativo nem signing remoto no caminho).

## 4. Verificar a release publicada (sempre, sem exceção)

O `electron-builder --publish` às vezes **cria releases duplicadas em
draft** por race condition (cada asset upload tenta criar a release se
ela ainda não existir, e paralelismo pode gerar duas). Sempre confira:

```bash
gh release list --repo EltonLuisFranca/DUX
```

Se aparecer a mesma tag duas vezes como Draft:

```bash
gh api repos/EltonLuisFranca/DUX/releases -q '.[] | select(.tag_name == "vX.Y.Z") | {id, draft, assets: [.assets[].name]}'
```

Mantenha a que tiver os assets completos (pacote(s) Linux + `.blockmap`
+ `latest-linux.yml`), apague a outra:

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
vimos isso deixar uma versão antiga marcada como Latest com uma mais
nova já publicada). Como o `electron-updater` consulta exatamente esse
endpoint (`/releases/latest`) para checar updates, isso faz o app
**nunca detectar a versão nova**, sem erro nenhum visível. Sempre
confirme e force se necessário:

```bash
gh api repos/EltonLuisFranca/DUX/releases/latest -q '.tag_name'
# se não for a versão que você acabou de publicar:
gh api -X PATCH repos/EltonLuisFranca/DUX/releases/<id-da-completa> -f make_latest=true
```

## 5. Confirmar que os assets estão acessíveis de verdade

Não confie só no `gh release view` — teste o download anônimo real, que é
o que o `electron-updater` do app instalado faz. O nome do arquivo de
manifest do auto-update no Linux é `latest-linux.yml` (não
`latest.yml`, que é o nome usado no Windows):

```bash
curl -sL -o /dev/null -w "%{http_code}\n" \
  "https://github.com/EltonLuisFranca/DUX/releases/download/vX.Y.Z/latest-linux.yml"
```

Espera-se 200. Se vier 404 logo após publicar, é só delay de
propagação do CDN — espere alguns minutos e tente de novo (não é sinal de
erro se a release já está confirmadamente fora de draft e pública).

Confira também que o `latest-linux.yml` referencia o nome exato do
asset que o GitHub gerou (ele **substitui espaços por pontos ou
hífens** de forma inconsistente dependendo de como o upload foi feito —
manual via `gh release create` vira ponto, `electron-builder` normaliza
para hífen). Se algum dia precisar subir um asset manualmente, confirme
o nome real via `gh release view vX.Y.Z --json assets -q '.assets[].name'`
**antes** de montar/editar o `latest-linux.yml` à mão.

## 6. Varredura de segredos (só na primeira vez que tornar público, ou se desconfiar)

```bash
git log --all -p 2>/dev/null | grep -iE "(api[_-]?key|secret|password|bearer\s+[a-z0-9]|sk-[a-z0-9]{10,})"
```

Revise manualmente os hits — não são todos positivos reais (o node Ollama
deste projeto tem um campo de UI chamado literalmente "token", isso não é
um segredo vazado).

## Gotchas deste ambiente (Linux — não pule, todos já causaram builds falhos)

- **ELECTRON_RUN_AS_NODE=1 vem setado pelo próprio harness do Claude
  Code** neste ambiente Linux (não só no WSL antigo). Rodar
  `electron`/`npm run dev`/`dist` sem `env -u ELECTRON_RUN_AS_NODE`
  antes faz o Electron rodar como Node puro — `electron.app` vem
  `undefined` e o main process crasha na primeira linha que usa
  `app.getPath(...)`. Sempre prefixe: `env -u ELECTRON_RUN_AS_NODE npm run dev`.
- **productName não pode ter espaço** de forma prática — mesmo
  escapado, o GitHub Releases normaliza nomes de asset trocando espaços
  por `.` ou `-` de forma inconsistente entre uploads manuais e
  automáticos, e isso já quebrou o `latest.yml`/`latest-linux.yml` do
  electron-updater mais de uma vez. O produto se chama DUX (sem sufixo)
  por causa exatamente disso.
- **Repo privado quebra o auto-update silenciosamente** — nenhum erro
  aparece no app, o `electron-updater` só nunca acha nada (404 anônimo).
  Sempre confirme `visibility: PUBLIC` antes de investigar qualquer outra
  coisa se o auto-update "não fizer nada".
- **Ferramentas de empacotamento faltando falham o target
  silenciosamente ruim** — se `dpkg-deb`/`rpmbuild` não estiverem
  instalados, o `electron-builder` erra ao tentar gerar `deb`/`rpm`.
  Instale as ferramentas ou remova o target da lista em
  `build.linux.target` do `package.json` antes de rodar o publish.
- **AppImage não está na lista de targets atual** — só `pacman`, `deb`
  e `rpm`. Se quiser um instalador universal (sem depender da distro),
  adicione `AppImage` a `build.linux.target`.

# Release Windows

Só se aplica quando este skill está rodando num WSL2 com interop pro
Windows host habilitado (confirme: `which cmd.exe` e `which powershell.exe`
devem resolver para `/mnt/c/Windows/...`). O projeto vive no mesmo caminho
de disco nas duas visões — `/mnt/c/Users/57224/dux-fleet` no WSL é
exatamente `C:\Users\57224\dux-fleet` no Windows — então dá pra ler/editar
arquivos normalmente com as ferramentas de sempre e só chamar `cmd.exe`
para efetivamente **rodar** `node`/`npm`/`electron-builder` do lado
Windows (onde o Electron consegue empacotar o `.exe` nativo).

O `package.json` já tem `build.win.target: nsis` e `build/icon.ico`
configurados — não precisa mexer nisso.

## 0. Use `cmd.exe`, não `powershell.exe`, para `npm`

Neste ambiente o PowerShell tem Execution Policy bloqueando `npm.ps1`:

```
npm : O arquivo ...\npm.ps1 não pode ser carregado porque a execução de
scripts foi desabilitada neste sistema. UnauthorizedAccess
```

`cmd.exe` chama `npm.cmd` direto e não esbarra nisso. Sempre rode os
comandos de build/publish do Windows via `cmd.exe /c "..."`. Teste
primeiro: `cmd.exe /c "node --version && npm --version"`.

## 1. Reinstale `node_modules` pelo lado Windows antes de buildar

Se o `node_modules` foi instalado por último via `npm install` no WSL puro
(fluxo Linux), os binários nativos (Electron, `node-pty`) estão compilados
para Linux — o build Windows vai empacotar o binário errado ou falhar.
Reinstale pelo lado Windows, **na raiz e também dentro de `bridge/`**
(tem `package.json` próprio, com o `node-pty`):

```bash
cmd.exe /c "cd /d C:\Users\57224\dux-fleet && npm install"
cmd.exe /c "cd /d C:\Users\57224\dux-fleet\bridge && npm install"
```

Isso é seguro e reversível: `node_modules` é artefato de build, não dado
do usuário. Rodar `npm install` de novo pelo lado Linux depois disso
recompila para Linux sem problema.

Você vai ver avisos assim, que **são ruído, ignore**:

```
npm warn allow-scripts N packages have install scripts not yet covered by allowScripts
npm warn allow-scripts   node-pty@1.1.0 (install: node-gyp rebuild)
```

É o gate de segurança "allow-scripts" do npm 11+ bloqueando o lifecycle
script do `node-pty`. Na prática isso não trava o build: o
`electron-builder` roda seu próprio passo `@electron/rebuild` durante o
`dist`/`dist:publish` (aparece como `installing native dependencies` no
log), que recompila/baixa os prebuilds do `node-pty` pra versão exata do
Electron alvo por fora dos lifecycle scripts do npm. Não tente resolver
com `npm approve-scripts`.

Também não é necessário ter MSVC/cmake instalados nesta máquina Windows:
o `node-pty` prioriza prebuilds (`node scripts/prebuild.js ||
node-gyp rebuild`) e o `nodejs-whisper` não compila o `whisper.cpp` no
install (sem postinstall pra isso) — então `where cl`/`where cmake` vindo
vazio não é um bloqueio.

## 2. Build + publish

```bash
GH_TOKEN=$(gh auth token)
cmd.exe /c "cd /d C:\Users\57224\dux-fleet && set GH_TOKEN=$GH_TOKEN && npm run dist:publish"
```

- O `gh` autenticado é o do WSL — não precisa (nem faz sentido) logar
  `gh` de novo no Windows; o token só é passado como env var pro processo
  `cmd.exe`.
- O build assina automaticamente com `signtool.exe` se houver certificado
  configurado na máquina (aparece `signing with signtool.exe` no log) —
  não requer nenhuma ação sua além de observar que rodou.
- Se der `EPERM: operation not permitted, rename '...\dist\win-unpacked.tmp' -> '...\dist\win-unpacked'`:
  é lock transitório do Windows Defender escaneando os binários recém
  extraídos do Electron. Limpe a pasta temp e rode de novo — resolve
  geralmente na segunda tentativa:
  ```bash
  cmd.exe /c "rd /s /q C:\Users\57224\dux-fleet\dist\win-unpacked.tmp 2>nul"
  ```

## 3. Build e publique também o instalador customizado (sempre, é o padrão)

Este projeto tem **dois instaladores Windows** e os dois são publicados em
toda release, com papéis diferentes — não pule esta etapa nem substitua o
NSIS por ela:

- **`DUX Setup X.Y.Z.exe`** (NSIS, gerado no passo 2 acima): é o que o
  `electron-updater` (`autoUpdater` em `src/main/index.js`) baixa e roda
  silenciosamente (`/S`) para o autoupdate em background. O `latest.yml`
  aponta pra ele. **Nunca remova este asset da release** — sem ele o
  autoupdate do app instalado para de funcionar silenciosamente, sem erro
  visível pro usuário.
- **`Instalar DUX X.Y.Z.exe`** (`installer/`, portable, com UI própria):
  é o instalador com a tela customizada do projeto — este é o asset que
  deve aparecer em destaque pra quem baixa manualmente pela página de
  releases do GitHub para uma instalação nova.

O `installer/` empacota `dist/win-unpacked`, que só existe depois que o
passo 2 (build do app principal) já rodou — sempre nesta ordem.

```bash
cmd.exe /c "cd /d C:\Users\57224\dux-fleet\installer && npm install"
cmd.exe /c "cd /d C:\Users\57224\dux-fleet\installer && npm run dist"
```

Isso gera `installer/dist/Instalar DUX X.Y.Z.exe` (não publica sozinho —
`installer/package.json` não tem `build.publish` configurado). Suba manual
na mesma release:

```bash
gh release upload vX.Y.Z "/mnt/c/Users/57224/dux-fleet/installer/dist/Instalar DUX X.Y.Z.exe" \
  --repo EltonLuisFranca/DUX --clobber
```

Confira o nome real pós-upload (o `gh release upload` normaliza espaço
para ponto, igual ao gotcha do `latest.yml` mais abaixo) — mas como este
asset **não é referenciado por nenhum `.yml` de autoupdate**, o nome exato
não quebra nada além de estética:

```bash
gh release view vX.Y.Z --repo EltonLuisFranca/DUX --json assets -q '.assets[].name'
```

## 4. Se a tag já tem release publicada (não-draft) no GitHub, publique os assets manualmente

Caso comum: o release Linux já saiu primeiro (passo 4 do fluxo Linux tira
a release do draft). Quando isso já aconteceu, o
`electron-builder --publish always` **recusa silenciosamente** subir os
assets novos:

```
GitHub release not created  reason=existing type not compatible with publishing type tag=vX.Y.Z existingType=release publishingType=draft
skipped publishing  file=... reason=existing type not compatible with publishing type ...
```

Ele só sabe criar/atualizar releases em draft, não fazer merge com uma já
publicada. Solução: pegue os artefatos gerados em `dist/` (acessíveis
também via `/mnt/c/...` no WSL) e suba manualmente:

```bash
cd "/mnt/c/Users/57224/dux-fleet/dist"
gh release upload vX.Y.Z \
  "DUX Setup X.Y.Z.exe" \
  "DUX Setup X.Y.Z.exe.blockmap" \
  "latest.yml" \
  --repo EltonLuisFranca/DUX --clobber
```

## 5. Corrija o `latest.yml` para o nome real do asset (sempre confira, não pule)

O `gh release upload` **normaliza espaço do nome do arquivo para ponto**
(`DUX Setup X.Y.Z.exe` → `DUX.Setup.X.Y.Z.exe`), mesmo se você tentar
forçar outro caractere via `local#nome-remoto`. Só que o `latest.yml`
gerado localmente pelo `electron-builder` usa a convenção *dele* (hífen:
`DUX-Setup-X.Y.Z.exe`) — as duas **não batem**, e isso quebra o
auto-update em silêncio (o `electron-updater` do app instalado pede um
asset com esse nome exato, recebe 404, e não há erro visível pro
usuário).

Sempre, depois do upload, confira o nome real:

```bash
gh release view vX.Y.Z --repo EltonLuisFranca/DUX --json assets -q '.assets[].name'
```

Se o nome do `.exe` for diferente do que está dentro do `latest.yml`
local (campos `url:` e `path:`), edite o `latest.yml` para bater
exatamente, e reenvie só ele:

```bash
gh release upload vX.Y.Z "/caminho/para/dist/latest.yml" --repo EltonLuisFranca/DUX --clobber
```

## 6. Confirmar que os assets estão acessíveis de verdade

Igual ao passo 5 do fluxo Linux, mas o manifest do Windows é `latest.yml`
(sem sufixo `-linux`):

```bash
curl -sL -o /dev/null -w "%{http_code}\n" "https://github.com/EltonLuisFranca/DUX/releases/download/vX.Y.Z/latest.yml"
curl -sL -o /dev/null -w "%{http_code}\n" "https://github.com/EltonLuisFranca/DUX/releases/download/vX.Y.Z/<nome-real-do-exe>"
curl -sL "https://github.com/EltonLuisFranca/DUX/releases/download/vX.Y.Z/latest.yml"   # eyeball o conteúdo
```

Espera-se 200 nos dois, e o `url`/`path` dentro do `latest.yml` deve
apontar exatamente pro nome que retornou 200. Se essa for a primeira
publicação da tag, confira também `releases/latest` igual ao passo 4 do
fluxo Linux (a marca "Latest" pode não ter sido recalculada).

## Gotchas deste ambiente (Windows via WSL interop)

- **PowerShell bloqueia `npm.ps1` por Execution Policy.** Use sempre
  `cmd.exe /c "..."` para `npm`/`node` do lado Windows.
- **`node_modules` é o mesmo caminho de disco nos dois lados** (WSL e
  Windows apontam pro mesmo diretório) — trocar de plataforma de build
  sem reinstalar empacota o binário nativo errado silenciosamente. Sempre
  `npm install` (raiz + `bridge/`) pelo lado que vai efetivamente buildar,
  logo antes do build.
- **Avisos `allow-scripts` bloqueando o install do `node-pty`** são
  ruído neste projeto — o `@electron/rebuild` do `electron-builder`
  recompila os nativos por fora dos lifecycle scripts do npm. Não precisa
  `npm approve-scripts`.
- **`EPERM` no rename de `win-unpacked.tmp`** é lock transitório do
  Windows Defender no build logo após baixar/extrair o Electron. Apague a
  pasta `.tmp` e rode de novo.
- **`electron-builder --publish always` não publica numa release já
  não-draft** — só cria/atualiza drafts. Se a tag já tem release pública
  (comum quando o Linux saiu primeiro), suba manualmente com
  `gh release upload ... --clobber`.
- **Nomes de asset por upload manual viram ponto, não hífen**
  (`gh release upload` normaliza espaço → `.`; `electron-builder` usa
  `-`). Sempre confira o nome real pós-upload e corrija o `latest.yml`
  antes de subir ele.
- **O manifest de auto-update no Windows é `latest.yml`** (sem sufixo
  `-linux`) — não confundir com o do Linux.
- **Nunca publique só um dos dois instaladores Windows.** O NSIS
  (`DUX Setup X.Y.Z.exe`) é infraestrutura do `electron-updater` — troque
  ele só pelo customizado e o autoupdate silencioso do app instalado para
  de funcionar sem nenhum erro visível. O customizado
  (`Instalar DUX X.Y.Z.exe`, de `installer/`) é a UI de instalação nova
  que o usuário vê ao baixar da página de releases. São públicos
  diferentes (autoupdate vs. instalação manual), não uma substituição um
  do outro.
