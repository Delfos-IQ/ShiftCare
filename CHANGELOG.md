# Changelog — ShiftCare

Todas as alterações relevantes estão documentadas neste ficheiro.  
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-PT/1.0.0/).

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
