---
name: release-dux
description: Publica uma nova release do DUX (build Linux via electron-builder + upload pro GitHub). Use quando o usuário pedir para "subir novo build", "publicar release", "fazer o release", ou similar neste projeto.
---

Este projeto (`dux`, repo `EltonLuisFranca/DUX`) roda nativamente em Linux
(Arch). O build de distribuição é feito direto aqui, sem interop com
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
Depois:

```bash
git add package.json
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

## Gotchas deste ambiente (não pule, todos já causaram builds falhos)

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
