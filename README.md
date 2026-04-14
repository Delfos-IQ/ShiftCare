# ShiftCare

**Gestão clínica de turno para enfermagem em UCIP/UCIN**

ShiftCare é uma aplicação web progressiva (PWA) de apoio à gestão de turno em unidades de cuidados intensivos pediátricos. Funciona offline, directamente no browser, sem instalação — e pode ser adicionada ao ecrã inicial do telemóvel.

> ⚠️ Ferramenta de apoio clínico. Não substitui o processo clínico oficial nem o julgamento do profissional de saúde.

---

## Funcionalidades

### Plano Gratuito
- Registo de doentes (nome, cama, idade, peso, diagnóstico, alergias)
- Sinais vitais com alertas pediátricos automáticos
- Avaliação ABCDE estruturada
- Lista de cuidados e to-dos com horários
- Medicação e nutrição
- Antecedentes pessoais e HDA
- Dispositivos e suporte ventilatório
- Transferência segura de turno por QR code
- Calculadora de doses pediátricas
- Backup e exportação local
- Modo claro/escuro

### Plano Premium
- 🎤 **Notas de voz** — ditação por microfone em notas e antecedentes
- 📷 **Câmara / OCR** — fotografar documentos clínicos e monitores para extracção automática de texto
- 🤖 **ISBAR com IA** — passagem de turno estruturada gerada automaticamente
- ⚡ **Transferência com IA** — QR enriquecido com resumo clínico gerado por IA

---

## Instalar a PWA

### Android / Chrome
1. Abrir `https://delfos-iq.github.io/ShiftCare/` no Chrome
2. Tocar no banner **"Instalar ShiftCare"** que aparece automaticamente
3. Confirmar **"Adicionar ao ecrã inicial"**

### iOS / Safari
1. Abrir `https://delfos-iq.github.io/ShiftCare/` no Safari
2. Tocar em **Partilhar** (ícone ↑)
3. Seleccionar **"Adicionar ao ecrã inicial"**

A app funciona offline após a primeira visita.

---

## Obter Acesso Premium

O acesso premium é adquirido por pagamento único (~10€) na plataforma Gumroad:

**[🛒 shiftcare.gumroad.com/l/premium](https://shiftcare.gumroad.com/l/premium)**

Após a compra receberá um código no formato `SHIFTCARE-XXXX-XXXX`. Introduza-o em **Configurações → Activar Premium** na app.

O código é válido para uso pessoal no dispositivo do comprador. Não é necessária conta, subscrição nem ligação a servidores.

---

## Privacidade

Todos os dados clínicos ficam **exclusivamente no dispositivo local** (localStorage do browser). Nenhum dado é enviado a servidores externos. As funcionalidades de IA enviam apenas resumos de texto anonimizados para processamento.

Ver [PRIVACY.md](PRIVACY.md) para detalhes completos.

---

## Licença

ShiftCare é distribuído sob a licença **AGPL-3.0**.

Pode usar, estudar, modificar e redistribuir o código, desde que:
- Mantenha a atribuição ao autor original
- Distribua qualquer versão modificada sob a mesma licença AGPL-3.0
- Se usar o código num servidor público, disponibilize o código-fonte modificado

Ver [LICENSE](LICENSE) para o texto completo.

---

## Contribuir

Contribuições são bem-vindas.

1. Fork do repositório
2. Criar branch: `git checkout -b feature/nome-da-feature`
3. Commit: `git commit -m "Adicionar: descrição"`
4. Push: `git push origin feature/nome-da-feature`
5. Abrir Pull Request

Bugs e sugestões via [Issues](https://github.com/delfos-iq/ShiftCare/issues).

---

## Stack

- HTML + CSS + JS vanilla (sem frameworks, ficheiro único)
- [LZ-String](https://github.com/pieroxy/lz-string) para compressão de dados QR
- Cloudflare Workers + [Groq](https://groq.com) (Llama 4 Scout) para funcionalidades de IA
- GitHub Pages para hosting

---

*Copyright © 2025-2026 Daniel Lanzas Martín — AGPL-3.0*
