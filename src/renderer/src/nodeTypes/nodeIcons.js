// Ícones de cada tipo de node — markup interno de <svg viewBox="0 0 20 20">
// (sem a tag <svg> em si, ver AddNodeModal.vue:48 pro wrapper de referência).
// Extraído de registry.js pra poder ser importado sozinho pelos componentes
// de node (NodeShell, via slot #icon) sem puxar os CreateForm/Settings de
// todo tipo junto — registry.js importa esses mesmos nomes daqui.

export const TERMINAL_ICON =
  '<rect x="2" y="3" width="16" height="14" rx="2.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M6 8l3 3-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M11 14h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'

export const BROWSER_ICON =
  '<circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M2.5 10h15M10 2.5c2.2 2.1 3.4 4.8 3.4 7.5s-1.2 5.4-3.4 7.5c-2.2-2.1-3.4-4.8-3.4-7.5S7.8 4.6 10 2.5z" stroke="currentColor" stroke-width="1.3" fill="none"/>'

export const OLLAMA_ICON =
  '<circle cx="10" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M4 17.5c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/><circle cx="7.8" cy="6.5" r="0.9" fill="currentColor"/><circle cx="12.2" cy="6.5" r="0.9" fill="currentColor"/>'

export const GIT_ICON =
  '<circle cx="10" cy="10" r="1.8" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="5" cy="4.5" r="1.8" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="5" cy="15.5" r="1.8" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M5 6.3V13.7M11.6 9.2C10 7.6 8 6.3 5 6.3" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>'

export const IMAGE_ICON =
  '<rect x="2" y="3" width="16" height="14" rx="2.2" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="7" cy="8" r="1.6" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M3.5 15l4.5-4.5 2.5 2.5 3.5-4 3 3.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'

export const HTTP_ICON =
  '<path d="M3 6.5h14M3 13.5h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M8 2.5L6 17.5M14 2.5l-2 15" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'

// cilindro de banco de dados (elipse no topo + laterais + duas linhas de
// "disco") — mesmo estilo stroke=currentColor dos outros ícones
export const DATABASE_ICON =
  '<ellipse cx="10" cy="4.8" rx="6.3" ry="2.3" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M3.7 4.8v10.4c0 1.3 2.8 2.3 6.3 2.3s6.3-1 6.3-2.3V4.8" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M3.7 10c0 1.3 2.8 2.3 6.3 2.3s6.3-1 6.3-2.3" stroke="currentColor" stroke-width="1.2" fill="none"/>'

// pilha de caixas (não a baleia do Docker, que é marca registrada) — mesmo
// estilo stroke=currentColor dos outros ícones deste registry
export const DOCKER_ICON =
  '<rect x="2.5" y="11" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><rect x="9" y="11" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><rect x="9" y="4.5" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><rect x="15.5" y="11" width="2.5" height="6" rx="0.8" stroke="currentColor" stroke-width="1.2" fill="none"/>'

// chave: círculo do bocal + haste + dentes — mesmo estilo stroke=currentColor dos outros ícones
export const CREDENTIAL_TEST_ICON =
  '<circle cx="6" cy="10" r="3.3" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M9.1 10H17M13.8 10v3M16.2 10v2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'

// radar de varredura: círculos concêntricos + agulha + um "ping" (porta
// aberta encontrada) — mesmo estilo stroke=currentColor dos outros ícones
export const PORT_SCAN_ICON =
  '<circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="10" cy="10" r="3.8" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M10 10L14.5 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="15" cy="5" r="1.4" fill="currentColor"/>'

// medidor tipo velocímetro (carga/RPS) — mesmo estilo stroke=currentColor dos outros ícones
export const LOAD_TEST_ICON =
  '<path d="M3 14a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M10 14L14 7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="14" r="1.3" fill="currentColor"/><path d="M4.5 14h-1M16.5 14h-1M6 8.5l-.7-.7M14 8.5l.7-.7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>'

// árvore de domínio: nó raiz ramificando em subdomínios — mesmo estilo stroke=currentColor dos outros ícones
export const SUBDOMAIN_SCAN_ICON =
  '<circle cx="4" cy="10" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="16" cy="4" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="16" cy="10" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="16" cy="16" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M6 10h2M10 10V4h4M10 10h4M10 10v6h4" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>'

// pasta com lupa: fuzzing de diretórios/endpoints escondidos — mesmo estilo stroke=currentColor dos outros ícones
export const DIR_FUZZ_ICON =
  '<path d="M2.5 6.5a1.3 1.3 0 0 1 1.3-1.3h3.4l1.3 1.6h6.7a1.3 1.3 0 0 1 1.3 1.3v6.1a1.3 1.3 0 0 1-1.3 1.3H3.8a1.3 1.3 0 0 1-1.3-1.3V6.5z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><circle cx="12.3" cy="12.3" r="2.3" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M14 14l2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'

// escudo com check: analisa os headers de resposta e reporta o nível de
// proteção — mesmo estilo stroke=currentColor dos outros ícones
export const SECURITY_HEADERS_ICON =
  '<path d="M10 2.5l6 2.2v5c0 4-2.6 6.8-6 7.8-3.4-1-6-3.8-6-7.8v-5l6-2.2z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><path d="M7 10l2 2 4-4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'

// cadeado: verificação de certificado/conexão TLS — mesmo estilo
// stroke=currentColor dos outros ícones
export const TLS_CHECK_ICON =
  '<rect x="4" y="9" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="10" cy="13" r="1.2" fill="currentColor"/>'

// chip com pinos: identifica a "pilha de tecnologia" (CMS/framework/servidor)
// por trás de uma URL — mesmo estilo stroke=currentColor dos outros ícones
export const TECH_FINGERPRINT_ICON =
  '<rect x="6" y="6" width="8" height="8" rx="1.3" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M8.5 6V3M11.5 6V3M8.5 17v-3M11.5 17v-3M6 8.5H3M6 11.5H3M17 8.5h-3M17 11.5h-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'

// inseto: checklist de vulnerabilidades comuns — mesmo estilo
// stroke=currentColor dos outros ícones
export const VULN_SCAN_ICON =
  '<ellipse cx="10" cy="11" rx="3.5" ry="4.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M10 6.5V4M8 5L6.7 3.7M12 5l1.3-1.3M6.5 9H3M6.5 12H3M13.5 9h3.5M13.5 12h3.5M7.3 15.5L5 17.5M12.7 15.5l2.3 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/>'

// globo com meridianos: consulta de DNS/WHOIS de um domínio — mesmo estilo
// stroke=currentColor dos outros ícones
export const DNS_WHOIS_ICON =
  '<circle cx="10" cy="10" r="7.2" stroke="currentColor" stroke-width="1.3" fill="none"/><ellipse cx="10" cy="10" rx="3.2" ry="7.2" stroke="currentColor" stroke-width="1.1" fill="none"/><path d="M2.8 10h14.4M3.6 6.2h12.8M3.6 13.8h12.8" stroke="currentColor" stroke-width="1.1" fill="none"/>'

// engrenagem simples — usado como ícone genérico pelo DuxBanNode (board de
// tarefas não tem um ícone próprio no registry, que registra "duxban" sem
// campo icon)
export const DUXBAN_ICON =
  '<rect x="3" y="4" width="14" height="12" rx="1.6" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M3 8h14" stroke="currentColor" stroke-width="1.3"/><path d="M7 11.5h6M7 14h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'

// roteador com três dispositivos conectados: varredura de dispositivos na
// rede local — mesmo estilo stroke=currentColor dos outros ícones
export const NETWORK_DEVICE_SCAN_ICON =
  '<circle cx="10" cy="5" r="1.8" stroke="currentColor" stroke-width="1.2" fill="none"/><circle cx="3.5" cy="15.5" r="1.8" stroke="currentColor" stroke-width="1.2" fill="none"/><circle cx="16.5" cy="15.5" r="1.8" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M10 6.8V10M10 10L4.6 14.1M10 10l5.4 4.1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/>'

// clock simples — usado pelo PomodoroNode (também sem campo icon no registry)
export const POMODORO_ICON =
  '<circle cx="10" cy="11" r="6.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M10 7.5V11l3 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M7.5 2.5h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'
