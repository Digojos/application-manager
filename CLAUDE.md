# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Comandos

```bash
npm install
npm run dev            # dev server (localhost)
npm run dev:lan        # dev server acessível na LAN (next.config.ts libera os IPv4 locais em allowedDevOrigins)
npm run build
npm run start
npm run lint           # eslint (flat config, eslint-config-next)

npx prisma migrate dev --name <nome>   # criar + aplicar migration em dev
npx prisma migrate deploy              # aplicar migrations (usado no container)
npx prisma generate                    # após alterar schema.prisma
npx prisma studio
npm run seed                           # cria admin inicial + registra miniapps no catálogo
```

Não existe suíte de testes nem test runner configurado no projeto.

Variáveis de ambiente: `DATABASE_URL` (MySQL — o `.env.example` está errado, mostra postgres), `AUTH_SECRET`, e em produção `NEXTAUTH_URL` + `AUTH_TRUST_HOST=true`. O seed aceita `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`.

Deploy: `docker compose up -d --build app`. O container roda `npx prisma migrate deploy && npm run start` na porta 3001 (publicada em 3002), com nginx em 8081→8080. O Dockerfile copia `lib/`, `prisma/`, `.next/` e `public/` — arquivos novos fora dessas pastas precisam ser adicionados ao Dockerfile.

## Arquitetura

Portal ("Application Manager") que serve um **catálogo de mini-aplicações** guardado no banco (`MiniApp`) e as próprias mini-apps como rotas do App Router.

**Catálogo e rotas.** A home lista os `MiniApp` com `active: true`. `/admin` faz o CRUD desse catálogo. O registro no banco e a implementação da rota são independentes: cadastrar um `path` não cria página, e `app/[...slug]/page.tsx` é o catch-all que consulta `getMiniAppByPath()` para diferenciar "404 de verdade" de "cadastrada mas não implementada". **Adicionar uma mini-app = criar `app/<slug>/page.tsx` + inserir a linha em `mini_apps`** (via `/admin` ou seed).

**Autenticação.** Auth.js v5 (`auth.ts`, Credentials + bcrypt, sessão JWT). Em Next.js 16 o middleware virou **`proxy.ts`** (raiz) — ele protege apenas `/admin/:path*`; `app/admin/layout.tsx` revalida com `auth()`. Atenção: as rotas `app/api/admin/miniapps/*` **não** verificam sessão, apesar do README afirmar que são autenticadas.

**Camadas.** Rotas de API são finas: validam com Zod (`lib/validations.ts` e os schemas exportados de `lib/scoreboard-sessions.ts`) e delegam para a camada de dados em `lib/`. Toda mensagem de erro/UI é em pt-BR. Prisma via singleton em `lib/prisma.ts`.

### Placar de vôlei (`/placar-volei`)

O mini-app mais complexo do repo, e o padrão a seguir para estado compartilhado entre telas:

- `lib/scoreboard.ts` — tipos, `scoreboardReducer` puro, defaults e funções `normalize*` (clamp de tamanhos de fonte, sets ímpares, etc.). Toda regra de partida vive aqui.
- Persistência: o estado inteiro (times, sets, histórico, tema de exibição) é um **blob JSON** na coluna `state` de `ScoreboardSession`. Não há colunas por campo; mudar o formato do estado exige tolerar estados antigos em `normalizeScoreboardState`.
- Fluxo de escrita: o controle faz `PATCH /api/scoreboard-sessions/[id]` com uma **ação** → `applyScoreboardSessionAction` roda o reducer no servidor e grava → `publishScoreboardSessionUpdate` notifica os listeners.
- Fluxo de leitura em tempo real: a view (`/placar-volei/view/[id]`) faz um GET inicial e assina `GET /api/scoreboard-sessions/[id]/stream` (SSE, `runtime = "nodejs"`, `dynamic = "force-dynamic"`, ping a cada 25s).
- **Limitação importante:** `lib/scoreboard-stream.ts` é um pub/sub em memória pendurado em `globalThis`. Funciona só com um processo — escalar o app para múltiplas instâncias quebra o tempo real.
- **Duplicação conhecida:** `app/placar-volei/page.tsx` (tela de controle) mantém uma cópia local dos tipos e do reducer (`GameState` / `gameReducer`), importando de `lib/scoreboard.ts` apenas tema e normalização. Alterar regras de partida exige mexer nos **dois** lugares.
- `controlToken` existe na sessão, mas o `PATCH` só o valida quando o cliente o envia — na prática o controle é público.
- Em `lib/scoreboard-sessions.ts` há um cast `prisma as ... { scoreboardSession: any }`; se os tipos do Prisma Client estiverem em dia, ele pode ser removido em vez de copiado para código novo. (O placar de basquete, abaixo, já não usa esse cast — o delegate tipado `prisma.basketballSession` funciona direto.)

### Placar de basquete (`/placar-basquete`)

Segue a mesma arquitetura de sessão do vôlei (tabela própria `BasketballSession`, `lib/basketball.ts` com o reducer puro, `lib/basketball-sessions.ts` com a persistência, rotas em `app/api/basketball-sessions/*`), mas com uma peça que o vôlei não tem: **cronômetro de jogo e de posse de 24s**. O relógio é modelado como **âncora**, não como contador, porque toda mutação é um PATCH síncrono no MySQL:

- `BasketballClockState = { isRunning, remainingMs, startedAt }` — `remainingMs` é o valor exato na última pausa/âncora; `startedAt` é um ISO **do servidor**. Enquanto roda, o tempo efetivo é `remainingMs - (now - startedAt)`, calculado por `clockRemainingMs()`. Só start/pause/ajuste tocam a rede; o tique é 100% client-side (`useLiveClocks` em `app/placar-basquete/use-basketball-clock.ts`, `setInterval` de 100ms).
- **O servidor carimba o "agora".** `basketballReducer(state, action, nowIso)` recebe `nowIso` como terceiro argumento em vez de ler `Date.now()` — o reducer continua puro, e `applyBasketballSessionAction` (`lib/basketball-sessions.ts`) é quem passa `new Date().toISOString()`. O cliente nunca envia timestamp; não há campo pra falsificar.
- **Deriva de relógio:** GET/PATCH/SSE sempre respondem com um envelope `{ ...sessão, serverNow }` (`toBasketballSessionPayload`). O cliente calibra um offset (`useServerClock`) com zona morta de 250ms, em vez do servidor reescrever o estado a cada push.
- **Quem detecta o zero:** a view (TV) **nunca** faz PATCH — ela só trava o display em `0.0`. Só o **controle** roda `useClockExpiry` e dispara `EXPIRE_CLOCK` (idempotente) quando o tempo efetivo chega a zero; isso é normalização + notificação (todas as TVs recebem um SSE e travam no mesmo instante), não requisito de correção — se o controle estiver fechado, todo mundo ainda calcula `0.0` sozinho.
- Automações configuráveis (todas com flag própria, desligáveis pelo painel): cesta reseta a posse de 24s (`resetShotClockOnScore`) e inverte a posse (`flipPossessionOnScore`); falta pausa os dois relógios (`pauseClocksOnFoul`); `useFouls: false` desliga faltas por completo (vira no-op no reducer).
- `lib/session-stream.ts` generaliza o pub/sub em memória do vôlei numa factory (`createSessionChannel`); `lib/scoreboard-stream.ts` virou um wrapper de 6 linhas em cima dela para não quebrar o vôlei. `lib/basketball-stream.ts` é o canal próprio do basquete. Mesma limitação: só funciona num processo só.
- Zod usa `z.discriminatedUnion` (não `z.union` como o vôlei) e **não** tem o escape hatch `state: z.custom<T>()` que o vôlei tem — todo PATCH precisa ser uma ação válida.

### Sorteio de times (`/sorteio-times`)

Mini-app **sem backend**: lógica pura em `lib/team-draw.ts` (sorteio balanceado por habilidade e função, movimentação entre times) e estado persistido no `localStorage` sob a chave `team-draw-state-v1`. Nada é salvo no banco.

### Shell de UI

`app/layout.tsx` → `app/AppFrame.tsx` (client) desenha o header comum. `ISOLATED_ROUTE_PREFIXES` isola rotas de tela cheia (TV/view) do header — hoje cobre `/placar-basquete/view` e `/placar-basquete/tv`, mas ainda carrega o prefixo original `"C"`, que não casa com rota nenhuma (o vôlei nunca foi isolado). Tailwind CSS 4 via `@tailwindcss/postcss`, sem `tailwind.config`.
