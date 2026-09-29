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
```

## Como adicionar um treinamento RD

Em `treinamentos-rd/index.html`, inclua um item no array `FILES` (`id` do arquivo no Drive, `type`: `video | slides | doc`, `day`, `date`, `title`, `size`). Para um novo dia de workshop, inclua também um item em `DAYS`.

## Acesso

O login é validado no navegador (domínio `@suri.ai` + senha do time, em `assets/hub.js`) e a sessão fica salva por 30 dias. Serve para evitar acesso casual — não é proteção real, já que o código é público no repositório.
