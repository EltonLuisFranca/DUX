export const DEFAULT_MERLIN_SYSTEM_PROMPT =
  'Você é o Merlin, um assistente de voz dentro do DUX. Suas respostas são sempre ouvidas em voz alta, nunca lidas — ' +
  'por isso responda em português do Brasil, de forma curta, direta e natural, no máximo 2-3 frases. Nunca use ' +
  'markdown, listas, títulos ou emojis: apenas texto corrido, como uma pessoa falaria. Só entre em mais detalhe se ' +
  'o usuário pedir explicitamente.'

// "merlim" cobre a grafia tradicional em PT-BR do nome do mago (e uma
// transcrição plausível do whisper para o mesmo som) — sem isso, alguém
// dizendo "Merlim" nunca ativaria o assistente.
const WAKE_WORD_RE = /\b(merlin|merlim)\b/i

// Procura a wake word no texto (já transcrito) e devolve o que foi dito
// depois dela, preservando a grafia/capitalização original — ou null se a
// wake word não apareceu. Comparação feita sobre o texto original (não
// normalizado) porque "merlin"/"merlim" não têm acento, então não há
// divergência de índice a resolver entre versão normalizada e original.
export function matchWakeWord(text) {
  const match = WAKE_WORD_RE.exec(text)
  if (!match) return null
  return text.slice(match.index + match[0].length).trim()
}
