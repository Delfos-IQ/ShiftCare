# Changelog — ShiftCare

Todas as alterações relevantes estão documentadas neste ficheiro.  
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-PT/1.0.0/).

---

## [3.5.0] — Abril 2026

### Adicionado
- **About simplificado** — versão injetada automaticamente via `APP_VERSION`; accordion "Histórico de versões" colapsável; câmara/mic em secção colapsável; cards de finalidade e privacidade condensados; removido card redundante de IA
- **Notas do Turno — 50 registos + scroll** — máximo aumentado de 8 → 50; últimas 8 visíveis por defeito com botão "Ver mais N registos" para expandir; cada nota tem ✏ editar inline e ✕ eliminar com confirmação
- **Cuidados & Intervenções (nova secção)** — substituiu "Cuidados & Higiene"; grupos temáticos com chips de acção rápida: Aspiração de Secreções (Orofaringe, Nasofaringe, TET, Traqueostomia), Colheitas/Amostras (Sangue, Urina, Secreções, Fezes, LCR, Exsudado, Liq. Pleural), Posicionamento integrado, Comunicação com a família; campo livre com **aprendizagem global** (persiste em `sc_custom_cuidados` localStorage entre doentes) + botão ✕ para remover sugestão aprendida
- **Higiene & Conforto (nova secção)** — seleção cumulativa: Tipo (Higiene parcial, Higiene completa) + Local/Modo (No leito, No chuveiro, Cuidados à boca); botão "Registar Higiene" cria nota combinada (ex. "Higiene parcial · No leito")
- **Dinâmica de Turno** — renomeado "To-Do do Turno" → "Dinâmica de Turno"; DEF_TASKS simplificado para 5 lembretes: ABCDE, Sinais vitais, Medicação, Balanço hídrico, Escalas; intervenções registadas (cuidados, higiene, intercorrências, alimentação) migram automaticamente como itens concluídos
- **Registo duplo universal** — todas as ações com relevância clínica registam simultaneamente nas Notas do Turno E na Dinâmica de Turno: dispositivos adicionados/retirados, alimentação iniciada, intercorrências alimentares, cuidados & higiene

### Corrigido
- `addTodoDone()` previne duplicados no mesmo minuto para eventos repetidos

## [3.4.0] — Abril 2026

### Adicionado
- **Alergias sempre visíveis** — badge vermelho sólido "⚠ ALERGIA: X" no cabeçalho do card; quando sem alergias, mostra "✓ Sem alergias" em verde subtil; campo na admissão com destaque vermelho e borda vermelha
- **TAD (Tensão Diastólica)** — substituída a glicemia no painel principal de sinais vitais; alertas automáticos por faixa etária pediátrica (neonate 25–55 mmHg → adolescente 60–90 mmHg)
- **Glicemia capilar** — campo secundário com indicador de hipo/hiperglicemia (<60 mg/dL / >180 mg/dL) abaixo do painel de vitais
- **Registo de Avaliação de Vitais** — botão "✅ Registar Avaliação" guarda snapshot completo com timestamp; mostra as últimas 3 avaliações abaixo do formulário; adiciona automaticamente às notas de turno
- **Módulo Eliminação** — novo tab com registo de diurese e dejecção: via (urinol, fralda, algália…), características (clara, concentrada, colúria, melenas…); registo automático nas notas de turno
- **Alimentação — Intercorrências** — nova secção no tab Alimentação: tipo (Vomitou, Bolsou, Estase Gástrica) e características (Alimentar, Aquoso, Bilioso, Fecaloide); registo automático nas notas de turno

- **ABCDE com botões** — avaliação ABCDE passa a ter opções predefinidas por componente (A: permeável, via comprometida, ETT…; B: padrão normal, dificuldade resp., taquipneia…; C: bem perfundido, TRC>2s, palidez…; D: AVPU, pupilas, convulsão…; E: normotermia, lesões, drenos…); múltipla selecção por componente; botão "Adicionar às Notas" cria registo estruturado nas notas de turno; textarea de observações adicional mantido
- **Higiene & Cuidados rápidos** — secção de registo rápido movida do To-Do para Enfermagem: chips para Higiene parcial/completa, no leito/chuveiro, cuidados à boca, cateter e aspiração de secreções; cada chip regista automaticamente nas notas de turno
- **Posicionamento** — renomeado "Lateralidade" → "Posicionamento"; opções actualizadas: Lateral Dto, Lateral Esq, Dorsal, Ventral, Semi-Fowler; mudança de posição regista automaticamente nas notas de turno
- **To-Do simplificado** — removidas secções "Registo Rápido" (QCATS) e "Acesso Rápido" do tab To-Do; "Estado da Unidade" renomeado para "Verificação da Unidade/Posto"; Debitómetro adicionado ao UNIT_CHECK

- **Sincronização WebSocket — cliente** — quatro fixes para estabilidade em redes móveis:
  - `ws.onclose` reconecta agora também quando o estado era `'connecting'` (não só `'connected'`), corrigindo o loop de timeout em 3G/4G
  - Keepalive ping a cada 25 s via `setInterval` enquanto a ligação está aberta, prevenindo o fecho da conexão idle por operadoras móveis
  - `_sync.pingInterval` limpo em `_syncDisconnectWS()` para evitar pings em ligações mortas
  - Worker: alarm configurado via `this.state.storage.setAlarm()` (substituiu a chamada incorrecta a `/__alarm`); snapshot enviado aos clientes novos ao ligar
- **Dispositivos — figuras etárias** — silhueta SVG distinguível por grupo etário: Neonato (macrocefalia, tronco curto, membros vestigiais + label), Lactente (cabeça grande, barriga proeminente + label), Criança (proporções adultas, pescoço visível + label); tamanho aumentado de 160 × 160 px → 200 × 200 px
- **Cateter Venoso Central femoral** — dots de CVC com localização "Femoral Direita/Esquerda" posicionados na região inguinal (y ≈ 74) em vez do pescoço (y ≈ 20); a lógica de pontos agora itera sobre `p.devices` (instâncias reais) permitindo múltiplos dispositivos do mesmo tipo

- **Alimentação — Intercorrências** — corrigido: chips de tipo e característica agora refletem a seleção atual ao re-renderizar (estado via `_icSel`, não manipulação direta do DOM); histórico das últimas 5 intercorrências visível após cada registo; botão "Registar" fica inativo enquanto nenhum tipo está selecionado
- **Eliminação** — módulo completo e funcional: tipos Urinou/Defecou com icon; via por tipo (Urinol/Fralda/Arrastadeira/Algália vs Fralda/Arrastadeira/WC); características urina (Clara/Concentrada/Amarelada/Colúria/Hematúria) e fezes (Líquidas…Melenas); histórico dos últimos 5 registos; auto-nota em cada registo

### Corrigido
- **Medicação reativar/suspender** — bug crítico de índice: `tglSusp(i)` usava índice do array filtrado (só horárias ou só perfusões) em vez do índice real no array completo `p.medications`; corrigido com `indexOf()` para obter índice correcto em todos os casos

## [3.3.2] — Abril 2026

### Corrigido
- **Badge de Sync sempre visível** — o botão `🔄 Sync` no cabeçalho estava oculto (`display:none`) até o utilizador já estar ligado, tornando impossível iniciar uma sessão de sincronização; agora é sempre visível com estilo neutro quando desligado e muda de cor conforme o estado (cinzento → amarelo → verde / vermelho)
- **Comentário do Service Worker** actualizado para v3.3.2 (estava desactualizado como v3.2)

### Adicionado
- **Backup Cloud Cifrado (zero-knowledge)** — botão "☁️ Backup Cloud Cifrado" no ecrã Sobre; dados cifrados localmente antes de qualquer transmissão
- **Cifragem AES-256-GCM** com chave derivada via PBKDF2-SHA-256 (100 000 iterações + salt aleatório de 16 bytes + IV de 12 bytes); a password nunca sai do dispositivo
- **Armazenamento Cloudflare KV** via Worker — máx. 5 backups por dispositivo (FIFO); os mais antigos são apagados automaticamente quando o limite é atingido; TTL de 1 ano
- **ID de dispositivo anónimo** (UUID v4 em `sc_backup_uid`) — sem nome, email ou qualquer dado pessoal associado ao backup
- **Restauro com validação** — ao restaurar, os dados são decifrados e validados por `_validateBackupData()` antes de serem aplicados; password incorrecta gera erro sem corromper dados locais
- **Indicador de progresso** durante backup/restauro (compressão LZ-String → cifragem → upload)
- **Conformidade RGPD** — dados cifrados, sem identificadores pessoais no servidor; Cloudflare actua como sub-processador; aviso exibido no modal
- Worker actualizado com endpoints `backup_save`, `backup_list`, `backup_load`, `backup_delete`
- `wrangler.toml` actualizado com binding `BACKUP_KV` (instruções de criação incluídas)
- Service Worker actualizado para `shiftcare-v3.3.2`

---

## [3.3.1] — Abril 2026

### Adicionado
- **Módulo de Investigação Científica** — ecrã dedicado acessível pelo ícone 🔍 no dashboard; o utilizador não sai da app em momento algum
- **Conversão MeSH/DeCS por IA** — palavras-chave ou diagnóstico em linguagem natural são convertidos automaticamente em descritores MeSH e DeCS pela Groq via Worker; descritores apresentados como chips removíveis
- **Importação de diagnóstico do doente** — botão que importa o diagnóstico principal do doente seleccionado para o campo de pesquisa
- **Pesquisa dupla PubMed + Europe PMC** — PubMed E-utilities API (ESearch + ESummary) e Europe PMC REST API; selecção individual ou combinada; max. 10 resultados por fonte
- **Filtros de pesquisa**: faixa etária pediátrica (Neonatal · Lactente · Criança · Adolescente · Pediátrico · Adulto) com mapeamento automático para MeSH de idade; intervalo de publicação (1/5/10 anos); tipo de publicação (Revisão Sistemática · Meta-análise · RCT · Ensaio Clínico · Revisão · Guideline)
- **Cards de resultados** com badge de fonte, autores, revista, ano, DOI, toggle do resumo, e link directo para PubMed/Europe PMC
- **Exportação por email** — gera mailto com lista formatada de artigos (título, autores, revista, URL, DOI)
- Worker actualizado para v3.3.1 com endpoint `type: 'mesh'`
- Service Worker actualizado para `shiftcare-v3.3.1`

---

## [3.3.0] — Abril 2026

### Adicionado
- **Sincronização WebSocket em tempo real** — dois dispositivos ShiftCare podem partilhar o turno em tempo real via sala identificada por código de 4–8 caracteres (ex: `A3F7`); o Cloudflare Worker usa Durable Objects (`SyncRoom`) como relay WebSocket com hibernação; cada sala expira automaticamente ao fim de 12h
- **Fluxo de sincronização**: ao ligar, envia estado completo comprimido (LZ-String); ao receber `peer_joined`, re-envia estado para o novo colega; cada `save()` dispara envio com debounce de 1.5s para não saturar o canal; merge por doente com last-write-wins
- **Reconnect automático**: se a ligação cair, tenta reconectar após 5s; o código da sala é persistido em localStorage para retomar a ligação entre sessões
- **Badge de sincronização** no cabeçalho do dashboard: 🟢 ligado (com número de dispositivos) · 🟡 a ligar · 🔴 offline — clicável para abrir o painel de gestão da sala
- **Validação na recepção**: todos os doentes recebidos passam por `_validatePatientObj()` antes de serem aplicados ao estado local
- Service Worker actualizado para `shiftcare-v3.3.0`

---

## [3.2.9] — Abril 2026

### Adicionado
- **Validação de schema em importação (A-05)** — função central `_validatePatientObj()` verifica campos obrigatórios (`name`, `bed`), limites fisiológicos dos vitais (ex: FC 0–350, SpO₂ 0–100, Temp 20–45), tipos de arrays, e limites de tamanho; aplicada em todos os 4 pontos de importação: backup JSON, código BULK, QR scanner e código de turno único
- **`_applyPatientFields()`** — utilitário partilhado que substitui duplicação de código de atribuição de campos clínicos em todos os pontos de importação
- Importação de backup mostra avisos e pede confirmação antes de aceitar dados com problemas; filtra doentes inválidos em vez de importar tudo ou nada
- Importação por código/QR mostra mensagem específica de erro de validação em vez de falha silenciosa
- Service Worker actualizado para `shiftcare-v3.2.9`

---

## [3.2.8] — Abril 2026

### Adicionado
- **Score PEWS automático** (Pediatric Early Warning Score — Brighton PEWS adaptado) — visível no tab Sinais Vitais com semáforo de urgência: Cardiovascular calculado a partir da FC vs. faixas normais por idade; Respiratório calculado a partir de FR + SpO₂ + suporte ventilatório activo; Comportamento seleccionável pelo enfermeiro (0=Adequado · 1=A dormir · 2=Irritável · 3=Letárgico/Confuso); PEWS ≥ 4 acrescenta 1 ao badge de alertas do doente; score e recomendação de acção incluídos no relatório PDF
- Service Worker actualizado para `shiftcare-v3.2.8`

---

## [3.2.7] — Abril 2026

### Adicionado
- **Portrait lock** — manifest já forçava portrait-primary; adicionado overlay de aviso em landscape com CSS `@media(orientation:landscape)` + Screen Orientation API para bloqueio automático em PWA standalone
- **Alertas de tendência de sinais vitais** — cada vital mostra agora uma seta (↑ ↑↑ ↓ ↓↓) calculada com base nos últimos 3 registos do `vitalsLog`; ↑↑/↓↓ piscam em vermelho, ↑/↓ em âmbar; log limitado a 30 entradas por doente
- **Exportação de relatório de turno em PDF** — `exportShiftPDF()` abre uma nova janela com relatório formatado (vitais com cores, medicação, pendentes, notas recentes) e aciona automaticamente o diálogo de impressão/guardar PDF; funciona offline
- Service Worker actualizado para `shiftcare-v3.2.7`

---

## [3.2.6] — Abril 2026

### Corrigido
- **A-01 — Índice de doente fora de bounds** — após `rmSetupPt()` e `deleteHist()`, `ST.idx` é agora fixado ao valor máximo válido para evitar crash silencioso
- **A-02 — Gestão de quota localStorage** — função `_trimData()` poda automaticamente `medHistory` (>100), `notes` (>50) e `todos` (>200) antes de atingir o limite; aviso visível ao utilizador; em caso de falha, tenta nova gravação após poda e, em último recurso, mostra mensagem de backup urgente
- **A-03 — Prematuros com `ageDays` negativo** — `vRanges()`, `ageCat()` e `ageLabel()` usam agora `Math.max(0, ageDays)` para tratar RNs com data de nascimento futura como neonatais sem crash
- **A-04 — Unidade de perfusão não validada no alerta de dose** — `getDoseAlert()` não é chamado para perfusões contínuas (`type==='perf'`), evitando comparações inválidas entre mcg/min ou mL/h e os limites da tabela PEDI_DOSES em mg/kg
- Service Worker actualizado para `shiftcare-v3.2.6`

---

## [3.2.1] — Abril 2026

### Adicionado
- **Crop de imagem antes do OCR** — após tirar a foto, o utilizador pode arrastar para seleccionar a região do texto a extrair antes de enviar para IA; sem selecção usa a imagem completa
- **Campo "Diluição" nas perfusões** — campo dedicado para diluição (ex: 50mg em 50mL NaCl 0,9%); campo "Notas" mantido em separado
- **Recuperação de acesso premium** — secção "Sobre" mostra aviso de recuperação quando sem licença, com botão directo para reintroduzir o código (disponível no e-mail de confirmação do Lemon Squeezy)

### Corrigido
- **Hora de início dos medicamentos** — `firstHour` agora extraído da hora de início seleccionada pelo utilizador em vez de fixo às 8h
- **Velocidade de infusão** no card de perfusão agora exibida em destaque (fonte grande) na área colorida do card
- Service Worker actualizado para `shiftcare-v3.2.1` para forçar atualização de cache

---

## [3.1.0] — Abril 2025

### Adicionado
- **PWA completa** — manifest.json, service-worker.js, set completo de ícones (9 tamanhos + maskable + apple-touch-icon + favicons), instalável no ecrã inicial de Android e iOS
- **Sistema freemium** — constante `PREMIUM_FEATURES`, função `isPremium()`, modal de desbloqueio por código, indicador de estado na configuração
- **Notas de voz** (premium) — ditação por microfone nas notas de turno e antecedentes/HDA
- **Câmara / OCR** (premium) — fotografar documentos clínicos e monitores; extracção de texto via IA
- **ISBAR com IA** (premium) — passagem de turno estruturada gerada automaticamente pelo modelo Llama
- **Transferência QR + IA** (premium) — código QR enriquecido com resumo clínico gerado por IA
- **Microfone rápido** nas fichas dos doentes (botão 🎤 no cabeçalho do card)
- **Suporte ventilatório** — botões estruturados (Ar Ambiente, O₂, Venturi, CAF, VNI, VMI, VAF) com sub-parâmetros contextuais e badge no cabeçalho do doente
- **Lateralidade** — nova secção na tab Cuidados com 5 posições (Direita, Esquerda, Dorsal, Semi-Fowler, Ventral)
- **Horários nos to-dos** — campos de hora planeada e hora realizada em cada tarefa
- **Transferência completa por QR** — tasks, unitCheck, devInactive, medHistory, positioning e vent incluídos no payload
- **Fallback de cópia** quando o QR excede o tamanho máximo
- **Blur de privacidade** — ecrã bloqueado automaticamente após 2 minutos de inactividade
- **Ecrã bloqueado** com sobreposição de desbloqueio por toque
- **Novo endpoint OCR** no Cloudflare Worker (`type: 'ocr'`)
- **Ficheiros legais** — LICENSE (AGPL-3.0), TERMS.md, PRIVACY.md, README.md

### Alterado
- Tab **Cuidados** reorganizada: Notas primeiro → ABCDE → Lista de Cuidados → Lateralidade
- **Unit Check** e **Registo Rápido** movidos para a tab To-Do
- **Análise IA do ISBAR** melhorada com formato estruturado de 700 caracteres
- Fluxo de O₂ aumentado para passos de 0.5 L/min (0.5 → 4 L/min)
- Manifest actualizado: `theme_color` `#0D9488`, `background_color` `#060B18`
- Ícones regenerados com o logo real ShiftCare (caminha UCIP)
- `service-worker.js` com probe silencioso antes do registo (sem erros em ambientes de preview)
- Worker actualizado para **Llama 4 Scout** (`meta-llama/llama-4-scout-17b-16e-instruct`) após deprecação do `llama-3.2-11b-vision-preview`
- Prefixo de contexto clínico injectado em todos os pedidos ao Worker para evitar bloqueio por filtro de conteúdo com fármacos opiáceos

### Corrigido
- Formato de imagem OCR corrigido de Anthropic native para OpenAI (`image_url`) compatível com Groq
- Erro 404 do Service Worker em ambientes de preview (claudeusercontent.com)
- Re-render após mover `confQ()` e `tglUC()` para a tab To-Do
- Importação por código em massa (bulk) não restaurava dados clínicos
- Importação single-patient não descomprimia prefixo `LZ|`
- Nesting HTML quebrado no `dashCard()` após inserção do botão de microfone

---

## [3.0.0] — Março 2025

### Adicionado
- Compressão LZ-String para transferência de pacientes por QR code
- Calculadora de doses pediátricas (PEDI_DOSES) com alertas de dose máxima
- Exportação e importação de backup em JSON
- Transferência em massa por código (`BULK|` prefix)
- Suporte a múltiplos doentes simultâneos por turno
- Modo claro/escuro com persistência
- Wake Lock para manter o ecrã activo durante o turno

### Alterado
- Chave localStorage migrada para `sc_v23`
- Arquitectura refactored para módulos: DATA, UI, VITALS, MEDS, DEVICES, TRANSFER

---

## [2.x] — 2024

### Funcionalidades base
- Registo de doentes (nome, cama, idade, peso, diagnóstico, alergias)
- Sinais vitais com alertas por faixa etária pediátrica
- Avaliação ABCDE
- Lista de cuidados e tarefas de turno
- Medicação e nutrição entérica/parentérica
- Dispositivos e acessos vasculares (mapa corporal interactivo)
- Antecedentes pessoais e HDA
- Transferência de turno por QR code (sem compressão)
- Geração de ISBAR com IA via Cloudflare Worker + Groq
