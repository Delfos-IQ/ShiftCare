# Política de Privacidade — ShiftCare

**Versão:** 1.0 · **Última actualização:** Abril 2025  
**Responsável:** Dani Lanzas Martín

---

## Resumo

> O ShiftCare **não recolhe, não transmite e não armazena** quaisquer dados pessoais ou clínicos em servidores externos. Todos os dados ficam exclusivamente no dispositivo do utilizador.

---

## 1. Que Dados São Processados

A aplicação permite introduzir os seguintes dados de doentes:

| Dado | Onde fica |
|------|-----------|
| Nome (ou iniciais) | localStorage do browser, no dispositivo |
| Número de cama | localStorage do browser, no dispositivo |
| Idade / data de nascimento | localStorage do browser, no dispositivo |
| Peso | localStorage do browser, no dispositivo |
| Dados clínicos de turno (sinais vitais, notas, medicação, etc.) | localStorage do browser, no dispositivo |

**Nenhum destes dados** é enviado para qualquer servidor, base de dados remota, serviço de analytics ou terceiro.

## 2. Dados que NÃO São Recolhidos

- ❌ Endereço IP
- ❌ Localização geográfica
- ❌ Identificadores de dispositivo
- ❌ Cookies de terceiros
- ❌ Dados de navegação ou comportamento
- ❌ Telemetria ou estatísticas de uso
- ❌ Dados de saúde identificáveis

## 3. Funcionalidades com Ligação a Servidores Externos

### 3.1 Inteligência Artificial (plano premium)

Quando o utilizador utiliza funcionalidades de IA (ISBAR, OCR por câmara, análise de imagem de monitor), **o texto do resumo clínico ou a imagem capturada** é enviado para o servidor de processamento IA:

- **Endpoint:** `shiftcare.pedicode-app.workers.dev` (Cloudflare Worker)
- **Modelo de IA:** Groq / Llama (processamento em memória, sem retenção de dados)
- **O que é enviado:** texto de resumo clínico anonimizado ou imagem de monitor/documento
- **O que NÃO é enviado:** nome do doente, número de cama, dados identificativos

> Recomendamos não incluir nomes, números de processo ou outros dados identificativos nos campos de texto livre antes de usar as funcionalidades de IA.

### 3.2 Recursos CDN

A aplicação carrega a biblioteca de compressão `lz-string` a partir de `cdnjs.cloudflare.com`. Esta ligação não transmite dados clínicos.

## 4. Armazenamento Local

Os dados ficam no `localStorage` do browser sob a chave `sc_v23`. O utilizador pode apagar todos os dados em qualquer momento através da função "Apagar Turno" na aplicação, ou limpando os dados do browser.

## 5. Service Worker e Cache

A PWA utiliza um service worker para funcionamento offline. O cache armazena apenas os ficheiros estáticos da aplicação (HTML, ícones, manifesto), nunca dados clínicos.

## 6. Exportação de Backup

A função de exportação de backup cria um ficheiro `.json` localmente no dispositivo do utilizador. Este ficheiro contém todos os dados do turno e é responsabilidade do utilizador garantir a sua segurança e confidencialidade.

## 7. Direitos do Utilizador

Uma vez que não existe processamento de dados pessoais em servidores externos, os direitos de acesso, rectificação e apagamento são exercidos directamente no dispositivo, através da própria aplicação ou do browser.

## 8. Menores

A aplicação não se destina a ser utilizada por menores de 18 anos, nem recolhe dados de menores.

## 9. Contacto

Para questões relacionadas com privacidade: consulte o repositório público em [github.com/delfos-iq/ShiftCare](https://github.com/delfos-iq/ShiftCare).

---

*Esta política reflecte fielmente o modelo de dados real da aplicação ShiftCare na versão actual.*
