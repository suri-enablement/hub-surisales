# HUB Suri · Enablement

HUB comercial interno da Suri (Closer, SDR, playbook, proposta, nova precificação da Meta e Treinamentos RD), no padrão visual do **Acervo Suri para RD** — Sora + Bricolage Grotesque, azul `#4A54FF → #000F9B`, verde Shop `#00B914`.

Publicado via GitHub Pages (`.github/workflows/static.yml`), sem build: é HTML estático.

## Estrutura

```
index.html               Login + HUB (cards de materiais e trilha RD)
assets/hub.css           Design system compartilhado (tokens, topnav, botões, cards)
assets/guide.css         Componentes dos guias gamificados (Closer/SDR)
assets/hub.js            Sessão/login, guard das páginas internas, pill do usuário
assets/img/              Logo, favicon e banner
guias/                   Escolha entre Closer e SDR
closer/  sdr/            Guias gamificados com scorecard
playbook/                Playbook comercial
proposta/                Gerador de proposta, impacto da cobrança e ROI
meta/                    Nova precificação da Meta + matriz de objeções
treinamentos-rd/         Gravações e slides dos workshops RD (Google Drive)
desempenho/              Painel de Desempenho do Closer (notas IA + humana)
tests/                   Testes (node --test) dos módulos com lógica
```

## Como adicionar um treinamento RD

Em `treinamentos-rd/index.html`, inclua um item no array `FILES` (`id` do arquivo no Drive, `type`: `video | slides | doc`, `day`, `date`, `title`, `size`). Para um novo dia de workshop, inclua também um item em `DAYS`.

## Acesso

O login é validado no navegador e a sessão fica salva por 30 dias. Há duas formas de entrar:

- **Entrar com Google** (Google Identity Services): aceita só contas `@suri.ai` com e-mail verificado. Usa apenas o *Client ID* OAuth (`Hub.GOOGLE_CLIENT_ID` em `assets/hub.js`). A chave secreta do cliente **não** é usada e não deve ser commitada. No Google Cloud Console, o domínio do GitHub Pages precisa estar em *Origens JavaScript autorizadas* do cliente OAuth.
- **E-mail + senha do time** (`assets/hub.js`), como alternativa.

A validação é feita no navegador. Serve para evitar acesso casual — não é proteção real, já que o código é público no repositório.

## Painel de Desempenho do Closer (`desempenho/`)

Mostra a evolução das notas das reuniões do Closer em visões semanal, mensal, trimestral e anual. A **nota final** combina a nota da IA com a avaliação humana: pesos em `SCORE_WEIGHTS`, 50/50 por padrão. Sem a avaliação humana, vale a nota da IA, marcada como provisória.

Continua sem build: são ES modules nativos com `// @ts-check` e tipos em JSDoc, verificados pelo TypeScript em modo `strict`.

```
desempenho/
  index.html, desempenho.css, app.js   UI (só desenha; nenhum cálculo aqui)
  lib/types.js            Modelo de dados (Closer, Meeting, Evaluation, DashboardData…)
  lib/config.js           Regras ajustáveis: pesos IA/humano, meta, faixas, níveis, gestores, fonte de dados
  lib/scoring.js          Nota final (IA + humana)
  lib/periods.js          Semana/mês/trimestre/ano, navegação e fatias do gráfico
  lib/metrics.js          calculatePeriodAverages, KPIs, distribuição, subcritérios, sequência, nível
  lib/insights.js         Insights em texto
  lib/dashboard.js        buildDashboard(): junta tudo para um closer + período
  lib/use-closer-metrics.js  "Hook" de estado: loading / refreshing / success / empty / error
  lib/charts.js           Gráficos SVG/HTML sem dependências (tooltip, crosshair, teclado)
  data/mock-provider.js   Dados FICTÍCIOS determinísticos (demonstração)
  data/http-provider.js   Provider para a integração real (via proxy)
  data/salesbud-mapper.js Mapeamento Salesbud → modelo do painel
```

**Demonstração:** `desempenho/index.html?g=week|month|quarter|year&d=2026-08-01&closer=c-ana`. Use `&demo=vazio` ou `&demo=erro` para ver os estados vazio e de erro. Atalhos de teclado: `[` e `]` navegam entre períodos; com o gráfico em foco, `←` e `→` percorrem os pontos.

**Testes e tipos** (Node 20+, sem dependências instaladas):

```bash
npm test            # node --test
npm run typecheck   # tsc --strict sobre desempenho/ (baixa o TypeScript via npx)
```

### Como ligar a integração com a Salesbud

1. **Não coloque o token da Salesbud no front-end.** O Hub é público no GitHub Pages. Crie um proxy leve (Cloudflare Worker, Apps Script ou Cloud Function) que valide a sessão `@suri.ai` e chame a API da Salesbud com o token guardado no servidor. As rotas esperadas estão em `data/http-provider.js`.
2. Confirme em https://docs.salesbud.com.br/ os nomes de campo e a escala das notas (0–10 ou 0–100). Ajuste `data/salesbud-mapper.js`: `SalesbudCall`, `CRITERIA_MAP` e `SOURCE_SCALE`. O teste `tests/desempenho/salesbud-mapper.test.js` serve de checklist.
3. Em `lib/config.js`, troque `DATA_CONFIG.source` para `'http'`, preencha `httpBaseUrl` e defina quem é gestor (`MANAGER_EMAILS`, ou papel vindo da API).
