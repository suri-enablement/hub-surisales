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
treinamentos-rd/         Treinamentos RD em duas trilhas: Vendas (Closer) e Pré-vendas (SDR)
```

## Como adicionar um treinamento RD

Em `treinamentos-rd/index.html`, inclua um item no array `FILES` com `track` (`vendas` ou `pre`), `id` do arquivo no Drive, `type` (`video | slides | doc | sheet`), `day`, `date`, `title` e `size`. Para um treinamento novo, inclua também um item em `DAYS` com o mesmo `track`. Arquivos fora do Drive (ex.: Zoom) usam `url` e `host`.

Links diretos para cada trilha: `treinamentos-rd/index.html#vendas` e `treinamentos-rd/index.html#pre-vendas`.

## Acesso

O login é validado no navegador e a sessão fica salva por 30 dias. Há duas formas de entrar:

- **Entrar com Google** (Google Identity Services): aceita só contas `@suri.ai` com e-mail verificado. Usa apenas o *Client ID* OAuth (`Hub.GOOGLE_CLIENT_ID` em `assets/hub.js`). A chave secreta do cliente **não** é usada e não deve ser commitada. No Google Cloud Console, o domínio do GitHub Pages precisa estar em *Origens JavaScript autorizadas* do cliente OAuth.
- **E-mail + senha do time** (`assets/hub.js`), como alternativa.

A validação é feita no navegador. Serve para evitar acesso casual — não é proteção real, já que o código é público no repositório.
