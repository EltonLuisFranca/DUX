import { ref } from 'vue'
import { watchAccountUsage } from '../lib/bridgeClient'

// Limite do plano Claude Pro/Max (sessão de 5h + semana), o mesmo que o
// /usage da CLI mostra — estado global da conta, não de um node/terminal
// específico, então mora aqui como singleton de módulo (mesmo padrão de
// notificationSoundStore.js) em vez de props/estado por componente.
export const session = ref(null) // { percent, resetsAt } | null
export const week = ref(null)
export const usageError = ref(null) // 'no-auth' | 'unauthorized' | 'network' | 'http-error' | 'bad-response' | null

watchAccountUsage((update) => {
  usageError.value = update.error || null
  // Num erro transitório (rede, 401 momentâneo) mantém o último valor bom na
  // tela em vez de zerar o badge a cada falha de poll — só troca quando a
  // resposta realmente trouxe dado novo.
  if (update.error) return
  session.value = update.session ?? null
  week.value = update.week ?? null
})
