<template>
  <div
    class="vs-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="vs-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="vs-handle"
      :class="{ connected: isRightConnected }"
    />
    <Handle
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="vs-handle"
      :class="{ connected: isBottomConnected }"
    />

    <div class="vs-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="statusDotClass" />
      <span class="vs-title">{{ data.name }}</span>
      <button class="header-btn nodrag" title="Configurações" @click="toggleNodeSettings(id)">
        <GearIcon />
      </button>
    </div>

    <div class="tabs-row nodrag">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="tab-body nodrag nowheel nopan">
      <!-- Alvo -->
      <div v-if="activeTab === 'target'" class="pane">
        <div class="field-block">
          <span class="section-label">URL alvo</span>
          <input v-model="url" class="header-input mono" type="text" placeholder="https://exemplo.com" @input="syncData" />
          <p class="hint">
            Roda os 9 módulos de recon/pentest do DUX (DNS/WHOIS, Detector de Tecnologias, Headers de Segurança,
            SSL/TLS, Varredura de Portas, Scanner de Subdomínios, Fuzzer de Diretórios, Checklist de
            Vulnerabilidades e Teste de Credenciais) contra este alvo, cada um na configuração padrão, e consolida
            tudo num único relatório por severidade. Use apenas em sistemas que você tem autorização para testar.
          </p>
        </div>

        <p v-if="domain" class="hint mono-hint">Domínio derivado para DNS/WHOIS, Subdomínios e TLS: {{ domain }}</p>

        <div class="field-row">
          <label class="exec-field">
            Timeout por checagem (ms)
            <input v-model.number="timeoutMs" type="number" min="1000" max="20000" :disabled="running" @input="syncData" />
          </label>
          <label class="exec-field">
            Concorrência
            <input v-model.number="concurrency" type="number" min="1" max="50" :disabled="running" @input="syncData" />
          </label>
        </div>
      </div>

      <!-- Visão Geral -->
      <div v-else-if="activeTab === 'overview'" class="pane">
        <div class="counts-row">
          <div class="count-pill sev-critical">
            <span class="count-value">{{ lastResult?.counts?.critical || 0 }}</span>
            <span class="count-label">Crítico</span>
          </div>
          <div class="count-pill sev-high">
            <span class="count-value">{{ lastResult?.counts?.high || 0 }}</span>
            <span class="count-label">Alto</span>
          </div>
          <div class="count-pill sev-medium">
            <span class="count-value">{{ lastResult?.counts?.medium || 0 }}</span>
            <span class="count-label">Médio</span>
          </div>
          <div class="count-pill sev-low">
            <span class="count-value">{{ lastResult?.counts?.low || 0 }}</span>
            <span class="count-label">Baixo</span>
          </div>
        </div>

        <div v-if="!running && !showConfirm" class="start-row">
          <button class="btn-primary" :disabled="!canStart" @click="clickStart">Executar tudo</button>
          <span v-if="!url" class="hint">Informe a URL alvo na aba Alvo.</span>
        </div>

        <div v-if="showConfirm" class="confirm-panel">
          <p>
            Confirma rodar a suíte completa contra <strong>{{ url }}</strong> — 9 módulos
            {{ loadTestEnabled ? '(incluindo um smoke test de carga leve)' : '(Teste de Carga desativado)' }}? Pode
            levar alguns minutos.
          </p>
          <div class="confirm-actions">
            <button class="btn-secondary" @click="showConfirm = false">Cancelar</button>
            <button class="btn-danger" @click="confirmStart">Confirmar e iniciar</button>
          </div>
        </div>

        <div v-if="running" class="progress-panel">
          <div class="progress-bar" :class="{ indeterminate: !progressPct }">
            <div class="progress-fill" :style="progressPct ? { width: progressPct + '%' } : undefined" />
          </div>
          <div class="progress-row">
            <span class="hint">{{ progressLabel }}</span>
            <button class="btn-secondary" @click="stopScan">Parar</button>
          </div>
        </div>

        <div v-if="lastResult?.findings?.length" class="findings-list">
          <div v-for="f in lastResult.findings" :key="f.id" class="finding-card" :class="severityClass(f.severity)">
            <div class="finding-head">
              <span class="severity-badge" :class="severityClass(f.severity)">{{ severityLabel(f.severity) }}</span>
              <span class="finding-name">{{ f.title }}</span>
              <span class="finding-module">{{ MODULE_LABELS[f.moduleId] }}</span>
            </div>
            <p class="hint finding-evidence">{{ f.evidence }}</p>
          </div>
        </div>
        <div v-else-if="lastResult && !running && !lastResult.error" class="banner ok">
          Nenhum achado nos 4 níveis de severidade.
        </div>

        <div v-if="lastResult && !lastResult.error" class="summary-row">
          <span class="hint">
            {{ lastResult.cancelled ? 'Parado manualmente' : 'Concluído' }} — {{ formatDuration(lastResult.durationMs) }}.
          </span>
        </div>
        <div v-if="lastResult && lastResult.error" class="banner danger">{{ lastResult.error }}</div>
      </div>

      <!-- DNS / WHOIS -->
      <div v-else-if="activeTab === 'dnsWhois'" class="pane">
        <p class="hint">DNS/WHOIS · configuração padrão (só usa o domínio derivado na aba Alvo).</p>
        <button class="link-btn" :disabled="!canRunSingle('dnsWhois')" @click="runSingleModule('dnsWhois')">Rodar só este módulo</button>
        <div v-if="moduleRunning.dnsWhois" class="progress-bar indeterminate"><div class="progress-fill" /></div>

        <template v-if="dnsResult && !dnsResult.error">
          <div class="section-block">
            <span class="section-label">Registros DNS</span>
            <div v-for="rt in recordGroups" :key="rt.type" class="record-row">
              <span class="record-type">{{ rt.type }}</span>
              <div class="record-values">
                <span v-if="!rt.entries.length" class="hint">(nenhum)</span>
                <span v-for="(v, i) in rt.entries" :key="i" class="record-value">{{ v }}</span>
              </div>
            </div>
          </div>

          <div class="section-block">
            <span class="section-label">Email (SPF / DMARC / DKIM)</span>
            <div class="pill-row">
              <span class="mail-pill" :class="dnsResult.spf ? 'pill-ok' : 'pill-bad'">SPF {{ dnsResult.spf ? 'OK' : 'ausente' }}</span>
              <span class="mail-pill" :class="dnsResult.dmarc ? 'pill-ok' : 'pill-bad'">DMARC {{ dnsResult.dmarc ? 'OK' : 'ausente' }}</span>
              <span class="mail-pill" :class="dnsResult.dkim?.length ? 'pill-ok' : 'pill-bad'">
                DKIM {{ dnsResult.dkim?.length ? `${dnsResult.dkim.length} seletor(es)` : 'não encontrado' }}
              </span>
            </div>
          </div>

          <div class="section-block">
            <span class="section-label">WHOIS</span>
            <div v-if="dnsResult.whois?.error" class="banner warn">{{ dnsResult.whois.error }}</div>
            <div v-else-if="dnsResult.whois?.parsed" class="whois-fields">
              <div v-if="dnsResult.whois.parsed.registrar" class="whois-field">
                <span class="hint">Registrador</span><span>{{ dnsResult.whois.parsed.registrar }}</span>
              </div>
              <div v-if="dnsResult.whois.parsed.expiresAt" class="whois-field">
                <span class="hint">Expira em</span><span>{{ dnsResult.whois.parsed.expiresAt }}</span>
              </div>
            </div>
          </div>
        </template>
        <div v-else-if="dnsResult?.error" class="banner danger">{{ dnsResult.error }}</div>
        <p v-else class="hint">Ainda não executado.</p>
      </div>

      <!-- Detector de Tecnologias -->
      <div v-else-if="activeTab === 'techFingerprint'" class="pane">
        <p class="hint">Detector de Tecnologias · configuração padrão.</p>
        <button class="link-btn" :disabled="!canRunSingle('techFingerprint')" @click="runSingleModule('techFingerprint')">Rodar só este módulo</button>
        <div v-if="moduleRunning.techFingerprint" class="progress-bar indeterminate"><div class="progress-fill" /></div>

        <template v-if="techResult && !techResult.error">
          <p class="hint">HTTP {{ techResult.status }} · {{ techResult.detected.length }} tecnologia(s)</p>
          <div v-if="techResult.detected.length === 0" class="banner ok">Nenhuma tecnologia identificada pelas assinaturas conhecidas.</div>
          <div v-else class="category-list">
            <div v-for="group in groupedDetected" :key="group.category" class="category-block">
              <span class="section-label">{{ CATEGORY_LABELS[group.category] || group.category }}</span>
              <div class="tech-pills">
                <span v-for="t in group.items" :key="t.id" class="tech-pill" :title="t.evidence">{{ t.name }}</span>
              </div>
            </div>
          </div>
        </template>
        <div v-else-if="techResult?.error" class="banner danger">{{ techResult.error }}</div>
        <p v-else class="hint">Ainda não executado.</p>
      </div>

      <!-- Headers de Segurança -->
      <div v-else-if="activeTab === 'securityHeaders'" class="pane">
        <p class="hint">Headers de Segurança · configuração padrão.</p>
        <button class="link-btn" :disabled="!canRunSingle('securityHeaders')" @click="runSingleModule('securityHeaders')">Rodar só este módulo</button>
        <div v-if="moduleRunning.securityHeaders" class="progress-bar indeterminate"><div class="progress-fill" /></div>

        <template v-if="shResult && !shResult.error">
          <div class="score-banner" :class="gradeClass(shResult.score.grade)">
            <span class="score-grade">{{ shResult.score.grade }}</span>
            <div class="score-info">
              <strong>{{ shResult.score.pct }}% de proteção</strong>
              <span class="hint">HTTP {{ shResult.status }}</span>
            </div>
          </div>
          <div class="header-list">
            <div v-for="h in shResult.headers" :key="h.id" class="header-row-item">
              <div class="header-row-head">
                <span class="header-name">{{ h.label }}</span>
                <span class="header-badge" :class="'status-' + h.status">{{ headerStatusLabel(h.status) }}</span>
              </div>
              <p v-if="h.value" class="hint header-value">{{ h.value }}</p>
            </div>
          </div>
        </template>
        <div v-else-if="shResult?.error" class="banner danger">{{ shResult.error }}</div>
        <p v-else class="hint">Ainda não executado.</p>
      </div>

      <!-- SSL/TLS -->
      <div v-else-if="activeTab === 'tlsCheck'" class="pane">
        <p class="hint">Verificador SSL/TLS · configuração padrão (porta 443).</p>
        <button class="link-btn" :disabled="!canRunSingle('tlsCheck')" @click="runSingleModule('tlsCheck')">Rodar só este módulo</button>
        <div v-if="moduleRunning.tlsCheck" class="progress-bar indeterminate"><div class="progress-fill" /></div>

        <template v-if="tlsResult && !tlsResult.error">
          <div v-for="(a, i) in tlsResult.alerts" :key="i" class="banner" :class="a.level === 'danger' ? 'danger' : 'warn'">{{ a.text }}</div>
          <div class="tls-summary">
            <div class="summary-pill" :class="tlsResult.authorized ? 'pill-ok' : 'pill-bad'">
              {{ tlsResult.authorized ? 'Cadeia confiável' : 'Cadeia não confiável' }}
            </div>
            <div class="summary-pill" :class="protocolPillClass(tlsResult.protocol)">{{ tlsResult.protocol || 'protocolo desconhecido' }}</div>
          </div>
          <div class="chain-list">
            <div v-for="(c, i) in tlsResult.chain" :key="i" class="chain-item">
              <div class="chain-item-head">
                <span class="chain-label">{{ i === 0 ? 'Certificado' : c.selfSigned ? 'Raiz (autoassinado)' : 'Emissor' }}</span>
                <span v-if="c.daysRemaining !== null" class="chain-days" :class="daysClass(c.daysRemaining)">
                  {{ c.daysRemaining >= 0 ? `${c.daysRemaining}d restantes` : `expirado há ${Math.abs(c.daysRemaining)}d` }}
                </span>
              </div>
              <p class="hint chain-name">{{ c.subject || '(sem subject)' }}</p>
            </div>
          </div>
        </template>
        <div v-else-if="tlsResult?.error" class="banner danger">{{ tlsResult.error }}</div>
        <p v-else class="hint">Ainda não executado.</p>
      </div>

      <!-- Portas -->
      <div v-else-if="activeTab === 'portScan'" class="pane">
        <p class="hint">Varredura de Portas · configuração padrão (top 20 portas comuns, banner grab ativo).</p>
        <button class="link-btn" :disabled="!canRunSingle('portScan')" @click="runSingleModule('portScan')">Rodar só este módulo</button>
        <div v-if="moduleRunning.portScan" class="progress-bar indeterminate"><div class="progress-fill" /></div>

        <template v-if="psResult && !psResult.error">
          <div v-if="psResult.openPorts.length" class="findings-list">
            <div v-for="p in psResult.openPorts" :key="p.port" class="finding-row">
              {{ p.port }} <span class="finding-status">({{ p.service }})</span>
            </div>
          </div>
          <div v-else class="banner ok">Nenhuma porta aberta em {{ psResult.totalPorts }} verificadas.</div>
        </template>
        <div v-else-if="psResult?.error" class="banner danger">{{ psResult.error }}</div>
        <p v-else class="hint">Ainda não executado.</p>
      </div>

      <!-- Subdomínios -->
      <div v-else-if="activeTab === 'subdomainScan'" class="pane">
        <p class="hint">Scanner de Subdomínios · configuração padrão (wordlist comum).</p>
        <button class="link-btn" :disabled="!canRunSingle('subdomainScan')" @click="runSingleModule('subdomainScan')">Rodar só este módulo</button>
        <div v-if="moduleRunning.subdomainScan" class="progress-bar indeterminate"><div class="progress-fill" /></div>

        <template v-if="ssResult && !ssResult.error">
          <div v-if="ssResult.found.length" class="findings-list">
            <div v-for="f in ssResult.found" :key="f.hostname" class="finding-row">
              {{ f.hostname }}
              <span class="finding-status">{{ f.ips?.length ? f.ips.join(', ') : '' }}{{ f.httpStatus ? ' · HTTP ' + f.httpStatus : '' }}</span>
            </div>
          </div>
          <div v-else class="banner ok">Nenhum subdomínio encontrado em {{ ssResult.totalSubdomains }} testados.</div>
        </template>
        <div v-else-if="ssResult?.error" class="banner danger">{{ ssResult.error }}</div>
        <p v-else class="hint">Ainda não executado.</p>
      </div>

      <!-- Diretórios -->
      <div v-else-if="activeTab === 'dirFuzz'" class="pane">
        <p class="hint">Fuzzer de Diretórios · configuração padrão (wordlist comum).</p>
        <button class="link-btn" :disabled="!canRunSingle('dirFuzz')" @click="runSingleModule('dirFuzz')">Rodar só este módulo</button>
        <div v-if="moduleRunning.dirFuzz" class="progress-bar indeterminate"><div class="progress-fill" /></div>

        <template v-if="dfResult && !dfResult.error">
          <div v-if="dfResult.found.length" class="findings-list">
            <div v-for="f in dfResult.found" :key="f.path" class="finding-row">
              <span class="status-badge" :class="dirStatusClass(f.status)">{{ f.status }}</span>
              /{{ f.path }} <span class="finding-status">{{ formatSize(f.size) }}</span>
            </div>
          </div>
          <div v-else class="banner ok">Nenhum path encontrado em {{ dfResult.totalPaths }} testados.</div>
        </template>
        <div v-else-if="dfResult?.error" class="banner danger">{{ dfResult.error }}</div>
        <p v-else class="hint">Ainda não executado.</p>
      </div>

      <!-- Checklist de Vulnerabilidades -->
      <div v-else-if="activeTab === 'checks'" class="pane">
        <p class="hint">Checklist de Vulnerabilidades · {{ CHECKS_CLIENT.length }} checagens, configuração padrão.</p>
        <button class="link-btn" :disabled="!canRunSingle('checks')" @click="runSingleModule('checks')">Rodar só este módulo</button>
        <div v-if="moduleRunning.checks" class="progress-bar indeterminate"><div class="progress-fill" /></div>

        <div v-if="vsResult && !vsResult.error" class="summary-row">
          <span class="hint">{{ vsResult.findings.length }} achado(s) em {{ vsResult.totalChecks }} checagens — detalhe completo na aba Geral.</span>
        </div>
        <div v-else-if="vsResult?.error" class="banner danger">{{ vsResult.error }}</div>

        <div v-for="group in CHECKS_BY_SEVERITY" :key="group.severity" class="category-block">
          <span class="section-label severity-label" :class="severityClass(group.severity)">{{ severityLabel(group.severity) }}</span>
          <div class="check-preview-list">
            <span v-for="c in group.items" :key="c.id" class="quick-pill">{{ c.name }}</span>
          </div>
        </div>
      </div>

      <!-- Credenciais -->
      <div v-else-if="activeTab === 'credentialTest'" class="pane">
        <p class="hint">
          Teste de Credenciais · roda automaticamente dentro do "Executar tudo" via auto-detecção heurística de
          formulário de login (varre paths comuns como /login, /wp-login.php etc). Sem botão manual aqui — não há um
          endpoint de login configurável nesta aba.
        </p>

        <template v-if="ctResult">
          <div v-if="ctResult.skipped" class="banner warn">Login não detectado automaticamente — nenhuma tentativa foi feita.</div>
          <div v-else-if="ctResult.error" class="banner danger">{{ ctResult.error }}</div>
          <template v-else>
            <p class="hint">
              Formulário detectado em <code>{{ ctResult.detected?.sourceUrl }}</code> (usuário:
              <code>{{ ctResult.detected?.userField }}</code>, senha: <code>{{ ctResult.detected?.passwordField }}</code>).
            </p>
            <div v-if="ctResult.findings?.length" class="banner danger">
              <strong>Credencial fraca aceita:</strong>
              <div v-for="f in ctResult.findings" :key="f.user + ':' + f.pass" class="finding-row">
                {{ f.user }} : {{ f.pass }} <span class="finding-status">({{ f.status }})</span>
              </div>
            </div>
            <div v-else class="banner ok">Nenhuma credencial fraca da lista rápida foi aceita.</div>
            <div v-if="ctResult.rateLimit?.detected" class="banner ok">
              Rate limit/lockout detectado após {{ ctResult.rateLimit.afterAttempts }} tentativas.
            </div>
            <div v-else-if="ctResult.totalAttempts" class="banner warn">
              Sem rate limit/lockout detectado em {{ ctResult.totalAttempts }} tentativas.
            </div>
          </template>
        </template>
        <p v-else class="hint">Ainda não executado — rode "Executar tudo" na aba Geral.</p>
      </div>

      <!-- Carga -->
      <div v-else-if="activeTab === 'loadTest'" class="pane">
        <label class="checkbox-label">
          <input type="checkbox" v-model="loadTestEnabled" @change="syncData" />
          Incluir no "Executar tudo"
        </label>
        <p class="hint">
          Teste de Carga · smoke test conservador (10 req/s, 5s, ramp-up 2s) — é o único módulo com impacto real de
          disponibilidade. Desative o toggle acima se não quiser rodá-lo automaticamente.
        </p>
        <button class="link-btn" :disabled="!canRunSingle('loadTest')" @click="runSingleModule('loadTest')">Rodar só este módulo</button>
        <div v-if="moduleRunning.loadTest" class="progress-bar indeterminate"><div class="progress-fill" /></div>

        <template v-if="ltResult && !ltResult.error">
          <div class="banner" :class="ltResult.errorRate >= 0.05 ? 'danger' : ltResult.errorRate > 0 ? 'warn' : 'ok'">
            {{ ltResult.totalCompleted }} requisições ({{ Math.round(ltResult.achievedRps) }} req/s médio).
          </div>
          <div class="stats-grid">
            <div class="stat-tile"><span class="stat-label">Taxa de erro</span><span class="stat-value">{{ formatPct(ltResult.errorRate) }}</span></div>
            <div class="stat-tile"><span class="stat-label">Latência p50</span><span class="stat-value">{{ ltResult.latency.p50 }}ms</span></div>
            <div class="stat-tile"><span class="stat-label">Latência p95</span><span class="stat-value">{{ ltResult.latency.p95 }}ms</span></div>
            <div class="stat-tile"><span class="stat-label">Latência p99</span><span class="stat-value">{{ ltResult.latency.p99 }}ms</span></div>
          </div>
        </template>
        <div v-else-if="ltResult?.error" class="banner danger">{{ ltResult.error }}</div>
        <p v-else class="hint">Ainda não executado.</p>
      </div>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import GearIcon from './icons/GearIcon.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'
import NodeToolbar from './NodeToolbar.vue'
import { toggleNodeSettings, updateNodeData } from '../store/flowStore'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'
import {
  runPentestSuite,
  runDnsWhois,
  runTechFingerprint,
  runSecurityHeadersCheck,
  runTlsCheck,
  runPortScan,
  runSubdomainScan,
  runDirFuzz,
  runVulnScan,
  runLoadTest
} from '../lib/bridgeClient'

// Rótulos e ordem de tabs — mesma ordem de execução do orquestrador
// (bridge/pentestSuite.js) pra bater com "rodando: <label>" no progresso.
const MODULE_LABELS = {
  dnsWhois: 'DNS / WHOIS',
  techFingerprint: 'Detector de Tecnologias',
  securityHeaders: 'Headers de Segurança',
  tlsCheck: 'Verificador SSL/TLS',
  portScan: 'Varredura de Portas',
  subdomainScan: 'Scanner de Subdomínios',
  dirFuzz: 'Fuzzer de Diretórios',
  vulnScan: 'Checklist de Vulnerabilidades',
  credentialTest: 'Teste de Credenciais',
  loadTest: 'Teste de Carga'
}

const TABS = [
  { id: 'target', label: 'Alvo' },
  { id: 'overview', label: 'Geral' },
  { id: 'dnsWhois', label: 'DNS' },
  { id: 'techFingerprint', label: 'Tech' },
  { id: 'securityHeaders', label: 'Headers' },
  { id: 'tlsCheck', label: 'TLS' },
  { id: 'portScan', label: 'Portas' },
  { id: 'subdomainScan', label: 'Subdom.' },
  { id: 'dirFuzz', label: 'Dirs' },
  { id: 'checks', label: 'Checks' },
  { id: 'credentialTest', label: 'Creds' },
  { id: 'loadTest', label: 'Carga' }
]

// prévia client-side da checklist do bridge (bridge/vulnScan.js) — mesmo
// motivo do COMMON_PATHS_CLIENT em DirFuzzNode.vue: mostrar a lista na aba
// sem ida e volta ao bridge. Precisa ficar em sincronia manual com CHECKS lá.
const CHECKS_CLIENT = [
  { id: 'git-exposed', name: '.git exposto', severity: 'critical' },
  { id: 'env-exposed', name: '.env exposto', severity: 'critical' },
  { id: 'aws-credentials-exposed', name: 'Credenciais AWS expostas', severity: 'critical' },
  { id: 'ssh-key-exposed', name: 'Chave SSH privada exposta', severity: 'critical' },
  { id: 'path-traversal', name: 'Path traversal básico', severity: 'critical' },
  { id: 'sql-injection-error', name: 'Erro de SQL ao injetar aspas', severity: 'critical' },
  { id: 'sql-backup-exposed', name: 'Backup de banco exposto', severity: 'high' },
  { id: 'reflected-xss', name: 'XSS refletido básico', severity: 'high' },
  { id: 'cors-misconfig', name: 'CORS mal configurado', severity: 'high' },
  { id: 'phpinfo-exposed', name: 'phpinfo() exposto', severity: 'high' },
  { id: 'spring-actuator-env', name: 'Spring Boot Actuator exposto', severity: 'high' },
  { id: 'open-redirect', name: 'Open redirect', severity: 'medium' },
  { id: 'dangerous-http-methods', name: 'Métodos HTTP perigosos habilitados', severity: 'medium' },
  { id: 'host-header-injection', name: 'Host header refletido', severity: 'medium' },
  { id: 'directory-listing', name: 'Listagem de diretório habilitada', severity: 'medium' },
  { id: 'verbose-error', name: 'Erro verboso / stack trace exposto', severity: 'medium' },
  { id: 'swagger-exposed', name: 'Documentação de API pública', severity: 'low' },
  { id: 'server-version-exposed', name: 'Versão de servidor exposta', severity: 'low' }
]

const CATEGORY_LABELS = {
  cms: 'CMS',
  framework: 'Framework / Linguagem',
  'js-library': 'Biblioteca JS',
  'web-server': 'Servidor Web',
  'cdn-waf': 'CDN / Proxy / WAF',
  analytics: 'Analytics / Terceiros'
}

const RECORD_ORDER = ['A', 'AAAA', 'MX', 'NS', 'CNAME', 'TXT', 'SOA', 'CAA']

function formatRecordEntries(type, value) {
  if (!value) return []
  if (type === 'SOA') {
    if (typeof value !== 'object' || Array.isArray(value)) return []
    return [`ns=${value.nsname} admin=${value.hostmaster} serial=${value.serial}`]
  }
  if (!Array.isArray(value)) return []
  if (type === 'MX') return value.map((r) => `${r.priority} ${r.exchange}`)
  if (type === 'TXT') return value.map((parts) => `"${(Array.isArray(parts) ? parts.join('') : parts)}"`)
  if (type === 'CAA') return value.map((r) => Object.entries(r).map(([k, v]) => `${k}=${v}`).join(' '))
  return value
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const SEVERITY_LABELS = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Info' }

const CHECKS_BY_SEVERITY = Object.keys(SEVERITY_ORDER)
  .map((severity) => ({ severity, items: CHECKS_CLIENT.filter((c) => c.severity === severity) }))
  .filter((g) => g.items.length)

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { isHandleConnected } = useHandleConnection(props.id)
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')
const isBottomConnected = isHandleConnected('bottom')

const { nodeWidth, nodeHeight, startResize } = useNodeResize(props, {
  minWidth: 440,
  minHeight: 500,
  defaultWidth: 560,
  defaultHeight: 620
})

const activeTab = ref('target')

const url = ref(props.data.url || '')
const timeoutMs = ref(props.data.timeoutMs ?? 6000)
const concurrency = ref(props.data.concurrency ?? 5)
const loadTestEnabled = ref(props.data.loadTestEnabled ?? true)

const running = ref(false)
const showConfirm = ref(false)
const runningModule = ref(null)
const subProgress = ref(null)
const lastResult = ref(props.data.lastResult || null)
const moduleRunning = reactive({})

let controller = null
let moduleController = null

function cleanHostname(input) {
  return String(input || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '')
}

const domain = computed(() => cleanHostname(url.value))

function syncData() {
  updateNodeData(props.id, {
    url: url.value,
    timeoutMs: timeoutMs.value,
    concurrency: concurrency.value,
    loadTestEnabled: loadTestEnabled.value,
    lastResult: lastResult.value
  })
}

const canStart = computed(() => Boolean(url.value.trim()) && !running.value)

const statusDotClass = computed(() => {
  if (running.value) return 'pending'
  const counts = lastResult.value?.counts
  if (!counts) return ''
  if (counts.critical || counts.high) return 'danger'
  if (counts.medium || counts.low) return 'warn'
  return 'online'
})

const progressPct = computed(() => (subProgress.value?.total ? Math.round((subProgress.value.seq / subProgress.value.total) * 100) : null))

const progressLabel = computed(() => {
  if (!runningModule.value) return 'iniciando...'
  const label = MODULE_LABELS[runningModule.value] || runningModule.value
  return subProgress.value?.total ? `${label} — ${subProgress.value.seq}/${subProgress.value.total}` : `${label}...`
})

// Resultados por módulo, sempre lidos de lastResult.modules — a aba
// "Checks" guarda o resultado bruto sob a chave 'vulnScan' (mesma que o
// orquestrador usa), as demais usam o próprio id da aba.
const dnsResult = computed(() => lastResult.value?.modules?.dnsWhois)
const techResult = computed(() => lastResult.value?.modules?.techFingerprint)
const shResult = computed(() => lastResult.value?.modules?.securityHeaders)
const tlsResult = computed(() => lastResult.value?.modules?.tlsCheck)
const psResult = computed(() => lastResult.value?.modules?.portScan)
const ssResult = computed(() => lastResult.value?.modules?.subdomainScan)
const dfResult = computed(() => lastResult.value?.modules?.dirFuzz)
const vsResult = computed(() => lastResult.value?.modules?.vulnScan)
const ctResult = computed(() => lastResult.value?.modules?.credentialTest)
const ltResult = computed(() => lastResult.value?.modules?.loadTest)

const recordGroups = computed(() => {
  if (!dnsResult.value?.records) return []
  return RECORD_ORDER.map((type) => ({ type, entries: formatRecordEntries(type, dnsResult.value.records[type]) }))
})

const groupedDetected = computed(() => {
  const detected = techResult.value?.detected || []
  const categories = [...new Set(detected.map((t) => t.category))]
  return categories.map((category) => ({ category, items: detected.filter((t) => t.category === category) }))
})

function severityClass(severity) {
  return `sev-${severity}`
}

function severityLabel(severity) {
  return SEVERITY_LABELS[severity] || severity
}

function headerStatusLabel(status) {
  if (status === 'ok') return 'OK'
  if (status === 'weak') return 'Fraco'
  if (status === 'missing') return 'Ausente'
  return 'Info'
}

function gradeClass(grade) {
  if (grade === 'A' || grade === 'B') return 'grade-good'
  if (grade === 'C') return 'grade-mid'
  return 'grade-bad'
}

function protocolPillClass(protocol) {
  if (!protocol) return 'pill-bad'
  const match = /TLSv(\d)(?:\.(\d))?/i.exec(protocol)
  const version = match ? Number(match[1]) + (match[2] ? Number(match[2]) / 10 : 0) : null
  return version !== null && version >= 1.2 ? 'pill-ok' : 'pill-bad'
}

function daysClass(days) {
  if (days < 0) return 'days-bad'
  if (days < 30) return 'days-warn'
  return 'days-ok'
}

function dirStatusClass(status) {
  if (status >= 200 && status < 300) return 'status-2xx'
  if (status >= 300 && status < 400) return 'status-3xx'
  if (status === 401 || status === 403) return 'status-auth'
  return 'status-other'
}

function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatPct(rate) {
  if (rate == null) return '0%'
  return `${Math.round(rate * 1000) / 10}%`
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return ''
  if (ms < 1000) return `${ms}ms`
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes ? `${minutes}m${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

function clickStart() {
  if (!canStart.value) return
  showConfirm.value = true
}

function confirmStart() {
  showConfirm.value = false
  startFullScan()
}

function startFullScan() {
  syncData()
  lastResult.value = null
  runningModule.value = null
  subProgress.value = null
  running.value = true
  activeTab.value = 'overview'

  controller = runPentestSuite(
    { url: url.value.trim(), timeoutMs: timeoutMs.value, concurrency: concurrency.value, modules: { loadTest: loadTestEnabled.value } },
    {
      onProgress: (msg) => {
        runningModule.value = msg.module
        subProgress.value = msg.seq && msg.total ? { seq: msg.seq, total: msg.total } : null
      },
      onResult: (result) => {
        running.value = false
        runningModule.value = null
        controller = null
        lastResult.value = result.error
          ? { error: result.error }
          : { cancelled: result.cancelled, modules: result.modules, findings: result.findings, counts: result.counts, durationMs: result.durationMs }
        syncData()
      }
    }
  )
}

function stopScan() {
  controller?.stop()
}

function payloadFor(moduleId) {
  const target = url.value.trim()
  switch (moduleId) {
    case 'dnsWhois':
      return { domain: domain.value, timeoutMs: timeoutMs.value }
    case 'techFingerprint':
    case 'securityHeaders':
    case 'dirFuzz':
    case 'checks':
      return { url: target, timeoutMs: timeoutMs.value, concurrency: concurrency.value }
    case 'tlsCheck':
      return { host: domain.value, timeoutMs: timeoutMs.value }
    case 'portScan':
      return { host: domain.value, ports: { mode: 'top20' }, grabBanner: true, concurrency: concurrency.value }
    case 'subdomainScan':
      return { domain: domain.value, timeoutMs: timeoutMs.value, concurrency: concurrency.value }
    case 'loadTest':
      return { target: { url: target, method: 'GET', headers: [] }, rps: 10, durationSec: 5, rampUpSec: 2 }
    default:
      return {}
  }
}

const RUNNERS = {
  dnsWhois: runDnsWhois,
  techFingerprint: runTechFingerprint,
  securityHeaders: runSecurityHeadersCheck,
  tlsCheck: runTlsCheck,
  portScan: runPortScan,
  subdomainScan: runSubdomainScan,
  dirFuzz: runDirFuzz,
  checks: runVulnScan,
  loadTest: runLoadTest
}

// a aba 'checks' guarda o resultado bruto em modules.vulnScan, mesma chave
// que o orquestrador usa — só o id da aba é diferente do id do módulo
const RESULT_KEY = { checks: 'vulnScan' }

function moduleResultKey(moduleId) {
  return RESULT_KEY[moduleId] || moduleId
}

function canRunSingle(moduleId) {
  return Boolean(url.value.trim()) && !running.value && !moduleRunning[moduleId]
}

function runSingleModule(moduleId) {
  if (!canRunSingle(moduleId)) return
  const runner = RUNNERS[moduleId]
  if (!runner) return
  moduleRunning[moduleId] = true

  moduleController = runner(payloadFor(moduleId), {
    onProgress: () => {},
    onResult: (result) => {
      moduleRunning[moduleId] = false
      moduleController = null
      if (!lastResult.value) lastResult.value = { modules: {}, findings: [], counts: {}, durationMs: 0 }
      if (!lastResult.value.modules) lastResult.value.modules = {}
      lastResult.value.modules[moduleResultKey(moduleId)] = result
      syncData()
    }
  })
}

onBeforeUnmount(() => {
  controller?.stop()
  moduleController?.stop()
})
</script>

<style scoped>
.vs-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.vs-node.selected {
  border-color: var(--selected-color);
}

.vs-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.vs-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.vs-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  height: 34px;
  padding: 0 10px;
  background: var(--color-bg-surface-alt);
  border-bottom: 1px solid var(--color-border);
  border-radius: 9px 9px 0 0;
  cursor: grab;
}

.vs-header:active {
  cursor: grabbing;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
  flex-shrink: 0;
}

.status-dot.online {
  background: #22c55e;
}

.status-dot.warn {
  background: #eab308;
}

.status-dot.danger {
  background: #ef4444;
}

.status-dot.pending {
  background: #eab308;
  animation: pulse 1.1s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.vs-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.header-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.tabs-row {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  padding: 6px 8px 0;
  overflow-x: auto;
}

.tab-btn {
  flex-shrink: 0;
  white-space: nowrap;
  padding: 5px 9px;
  border: none;
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 10.5px;
  font-weight: 500;
  cursor: pointer;
}

.tab-btn:hover {
  color: var(--color-text-secondary);
}

.tab-btn.active {
  background: var(--color-bg-app);
  color: var(--color-text-primary);
  font-weight: 600;
}

.tab-body {
  flex: 1;
  min-height: 0;
  background: var(--color-bg-app);
  overflow-y: auto;
  border-radius: 0 0 9px 9px;
}

.pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-row {
  display: flex;
  gap: 10px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.hint {
  margin: 0;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

.hint code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--color-bg-surface-raised);
  font-family: 'Menlo', Consolas, monospace;
}

.mono-hint {
  font-family: 'Menlo', Consolas, monospace;
  word-break: break-word;
}

.header-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 12px;
}

.header-input.mono {
  font-family: 'Menlo', Consolas, monospace;
}

.header-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.exec-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10.5px;
  color: var(--color-text-secondary);
}

.exec-field input {
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11.5px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--color-text-primary);
  cursor: pointer;
}

.category-block {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.severity-label {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 999px;
}

.check-preview-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.quick-pill {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-size: 10.5px;
}

.tech-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tech-pill {
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
  font-size: 10.5px;
  font-weight: 600;
  cursor: default;
}

.start-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: #3b82f6;
  color: #fff;
}

.btn-primary:disabled {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  cursor: default;
}

.btn-secondary {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
}

.btn-secondary:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.btn-danger {
  background: #ef4444;
  color: #fff;
}

.link-btn {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 10.5px;
  text-decoration: underline;
  cursor: pointer;
}

.link-btn:hover {
  color: var(--color-text-primary);
}

.link-btn:disabled {
  color: var(--color-text-tertiary);
  opacity: 0.5;
  cursor: default;
  text-decoration: none;
}

.confirm-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-bg-surface);
}

.confirm-panel p {
  margin: 0;
  font-size: 11.5px;
  color: var(--color-text-primary);
  word-break: break-word;
}

.confirm-actions {
  display: flex;
  gap: 6px;
}

.progress-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  overflow: hidden;
}

.progress-bar.indeterminate .progress-fill {
  width: 40% !important;
  animation: indeterminate 1.1s ease-in-out infinite;
}

@keyframes indeterminate {
  0% {
    margin-left: -40%;
  }
  100% {
    margin-left: 100%;
  }
}

.progress-fill {
  height: 100%;
  background: #3b82f6;
  transition: width 0.15s ease;
}

.progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.banner {
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11.5px;
  line-height: 1.5;
}

.banner.ok {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.banner.warn {
  background: rgba(234, 179, 8, 0.12);
  color: #b45309;
}

.banner.danger {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.findings-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.finding-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-left-width: 3px;
  border-radius: 7px;
  background: var(--color-bg-surface);
}

.finding-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.finding-name {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.finding-module {
  flex-shrink: 0;
  font-size: 9.5px;
  color: var(--color-text-tertiary);
}

.finding-evidence {
  font-family: 'Menlo', Consolas, monospace;
  word-break: break-word;
}

.finding-row {
  font-family: 'Menlo', Consolas, monospace;
  font-size: 11px;
  padding: 4px 0;
}

.finding-status {
  font-weight: 400;
  opacity: 0.8;
  color: var(--color-text-tertiary);
}

.severity-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
}

.counts-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.count-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 6px 4px;
  border-radius: 8px;
}

.count-value {
  font-size: 16px;
  font-weight: 700;
  font-family: 'Menlo', Consolas, monospace;
}

.count-label {
  font-size: 9.5px;
  opacity: 0.85;
}

.count-pill.sev-critical {
  background: rgba(239, 68, 68, 0.14);
  color: #ef4444;
}

.count-pill.sev-high {
  background: rgba(249, 115, 22, 0.14);
  color: #f97316;
}

.count-pill.sev-medium {
  background: rgba(234, 179, 8, 0.14);
  color: #b45309;
}

.count-pill.sev-low {
  background: rgba(59, 130, 246, 0.14);
  color: #3b82f6;
}

.sev-critical {
  border-left-color: #ef4444;
}
.sev-critical.severity-badge,
.severity-badge.sev-critical {
  background: rgba(239, 68, 68, 0.18);
  color: #ef4444;
}
.severity-label.sev-critical {
  background: rgba(239, 68, 68, 0.18);
  color: #ef4444;
}

.sev-high {
  border-left-color: #f97316;
}
.severity-badge.sev-high {
  background: rgba(249, 115, 22, 0.18);
  color: #f97316;
}
.severity-label.sev-high {
  background: rgba(249, 115, 22, 0.18);
  color: #f97316;
}

.sev-medium {
  border-left-color: #eab308;
}
.severity-badge.sev-medium {
  background: rgba(234, 179, 8, 0.18);
  color: #b45309;
}
.severity-label.sev-medium {
  background: rgba(234, 179, 8, 0.18);
  color: #b45309;
}

.sev-low {
  border-left-color: #3b82f6;
}
.severity-badge.sev-low {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}
.severity-label.sev-low {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.sev-info {
  border-left-color: var(--color-text-tertiary);
}
.severity-badge.sev-info {
  background: rgba(148, 163, 184, 0.15);
  color: var(--color-text-secondary);
}
.severity-label.sev-info {
  background: rgba(148, 163, 184, 0.15);
  color: var(--color-text-secondary);
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-bg-surface);
}

.record-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.record-type {
  flex-shrink: 0;
  width: 42px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.record-values {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.record-value {
  font-family: 'Menlo', Consolas, monospace;
  font-size: 10.5px;
  color: var(--color-text-primary);
  word-break: break-word;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.mail-pill {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
}

.mail-pill.pill-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.mail-pill.pill-bad {
  background: rgba(148, 163, 184, 0.15);
  color: var(--color-text-secondary);
}

.whois-fields {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.whois-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-primary);
}

.whois-field .hint {
  flex-shrink: 0;
  width: 90px;
}

.score-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
}

.score-banner.grade-good {
  background: rgba(34, 197, 94, 0.12);
}

.score-banner.grade-mid {
  background: rgba(234, 179, 8, 0.12);
}

.score-banner.grade-bad {
  background: rgba(239, 68, 68, 0.12);
}

.score-grade {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--color-bg-surface);
  font-size: 15px;
  font-weight: 700;
}

.score-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--color-text-primary);
}

.header-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-row-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-bg-surface);
}

.header-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.header-name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.header-value {
  font-family: 'Menlo', Consolas, monospace;
  word-break: break-word;
}

.header-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
}

.header-badge.status-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.header-badge.status-weak {
  background: rgba(234, 179, 8, 0.15);
  color: #b45309;
}

.header-badge.status-missing {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.header-badge.status-info {
  background: rgba(148, 163, 184, 0.15);
  color: var(--color-text-secondary);
}

.tls-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.summary-pill {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
}

.summary-pill.pill-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.summary-pill.pill-bad {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.chain-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chain-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-bg-surface);
}

.chain-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chain-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.chain-name {
  font-family: 'Menlo', Consolas, monospace;
  word-break: break-word;
}

.chain-days {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
}

.chain-days.days-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.chain-days.days-warn {
  background: rgba(234, 179, 8, 0.15);
  color: #b45309;
}

.chain-days.days-bad {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.status-badge {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
}

.status-badge.status-2xx {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.status-badge.status-3xx {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.status-badge.status-auth {
  background: rgba(234, 179, 8, 0.15);
  color: #b45309;
}

.status-badge.status-other {
  background: rgba(148, 163, 184, 0.15);
  color: var(--color-text-secondary);
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.stat-tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
}

.stat-label {
  font-size: 9.5px;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.stat-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-primary);
  font-family: 'Menlo', Consolas, monospace;
}

.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 3px;
  box-sizing: border-box;
  color: var(--color-text-tertiary);
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.vs-node:hover .resize-handle {
  opacity: 1;
}
</style>
