// escreve o texto e o Enter como dois eventos separados, com um intervalo
// entre eles — a maioria dos TUIs (Claude Code incluso) trata uma rajada única
// e grande de bytes terminada em \n como "colar texto com quebra de linha
// dentro do campo", não como "digitar e confirmar com Enter". Separar os dois
// imita o que um humano realmente faz e evita o texto ficar só sentado no
// campo de input, sem ser enviado.
//
// Enfileirada por ptyProcess: duas chamadas concorrentes pro mesmo terminal
// (ex: agentLink e noteLink injetando aviso quase ao mesmo tempo) senão
// intercalariam o segundo texto no meio do primeiro, antes do \r do primeiro
// disparar — exatamente o tipo de texto grudado e nunca enviado que já
// aconteceu aqui uma vez.
const writeQueues = new WeakMap()

function writeAsMessage(ptyProcess, text) {
  const previous = writeQueues.get(ptyProcess) || Promise.resolve()
  const next = previous.then(
    () =>
      new Promise((resolve) => {
        ptyProcess.write(text)
        setTimeout(() => {
          ptyProcess.write('\r')
          resolve()
        }, 80)
      })
  )
  writeQueues.set(ptyProcess, next)
  return next
}

// Mesmo mecanismo de writeAsMessage, mas sem o \r final — o texto fica
// sentado no campo de input do terminal em vez de ser enviado sozinho.
// Usado pelo aviso de nota conectada (noteLink.js): o usuário deve ver que
// o arquivo está disponível, mas o agente só deve agir quando o usuário
// mandar a próxima mensagem de verdade (apagando, completando ou só dando
// Enter no aviso, à escolha dele) — diferente do aviso de link agente<->
// agente e do dux ask, que continuam se auto-confirmando de propósito.
function writeAsDraft(ptyProcess, text) {
  const previous = writeQueues.get(ptyProcess) || Promise.resolve()
  const next = previous.then(
    () =>
      new Promise((resolve) => {
        ptyProcess.write(text)
        resolve()
      })
  )
  writeQueues.set(ptyProcess, next)
  return next
}

// Envolve o texto injetado pelo DUX (mensagens [DUX]) com cor ANSI ciano —
// só decoração visual no terminal, o agente recebe o mesmo texto puro de
// qualquer forma (as sequências de escape não alteram o conteúdo, o terminal
// só as interpreta como estilo).
const DUX_ICON = '🤖'
function decorateDuxMessage(text) {
  return `\x1b[36m${DUX_ICON} ${text}\x1b[0m`
}

module.exports = { writeAsMessage, writeAsDraft, decorateDuxMessage }
