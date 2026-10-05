; Incluído automaticamente pelo electron-builder no instalador NSIS (é o
; caminho padrão de nsis.include). customHeader entra depois do common.nsh do
; template, que define "nevershow" — então aqui sobrescreve e o instalador já
; abre com a lista de detalhes (o que está sendo extraído/criado) visível.
!macro customHeader
  ShowInstDetails show
  ; mesmo guard do common.nsh — fora do build do desinstalador o NSIS avisa,
  ; e o electron-builder trata aviso como erro
  !ifdef BUILD_UNINSTALLER
    ShowUninstDetails show
  !endif
!macroend
