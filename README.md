# Application Manager

Plataforma web para gerenciamento e acesso a mini-aplicações. Conta com uma home pública que lista os apps disponíveis, um painel administrativo protegido por autenticação para gerenciar os cadastros via CRUD, e rotas dinâmicas para cada mini-aplicação.

## Tecnologias

| Tecnologia | Versão | Função |
|---|---|---|
| [Next.js](https://nextjs.org) | 16.2.4 | Framework full-stack (App Router) |
| React | 19 | UI |
| TypeScript | 5 | Tipagem estática |
| Tailwind CSS | 4 | Estilização |
| Prisma | 6 | ORM |
| MySQL | — | Banco de dados |
| Auth.js (next-auth) | v5 beta | Autenticação |
| bcryptjs | — | Hash de senhas |
| Zod | 4 | Validação de dados |
| React Hook Form | 7 | Formulários |

## Pré-requisitos

- Node.js 20+
- MySQL rodando localmente (ou acessível via URL)

## Instalação e configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
DATABASE_URL="mysql://usuario:senha@localhost:3306/application_manager"
AUTH_SECRET="sua-chave-secreta-aqui"
```

Gere um valor seguro para `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Aplicar migrations e criar o banco

```bash
npx prisma migrate deploy
```

### 4. Criar o usuário admin inicial

```bash
$env:TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS"}'; npx ts-node prisma/seed.ts
```

Credenciais padrão criadas:
- **Email:** `admin@admin.com`
- **Senha:** `admin123`

> Para usar credenciais customizadas, defina `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_NAME` no `.env` antes de rodar o seed.

### 5. Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Scripts disponíveis

| Script | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com Turbopack |
| `npm run build` | Build de produção |
| `npm run start` | Inicia o servidor de produção |
| `npm run lint` | Executa o ESLint |

## Rotas

| Rota | Descrição | Acesso |
|---|---|---|
| `/` | Home — lista as mini-aplicações ativas | Público |
| `/login` | Tela de login do admin | Público |
| `/admin` | Painel de gerenciamento (CRUD de mini-apps) | Autenticado |
| `/placar-volei` | Controle do placar (aceita `?sessionId=<id>`) | Público |
| `/placar-volei/sessoes` | CRUD de sessões do placar | Público |
| `/placar-volei/view/[id]` | Tela de visualização (somente leitura) da sessão | Público |
| `/[...slug]` | Fallback para rotas não implementadas | Público |

## Placar de vôlei por sessão

O placar agora funciona por sessão, separando claramente quem controla de quem apenas visualiza.

### Conceitos

- **Controle**: rota interativa para operar o placar e configurar aparência.
- **View**: rota somente leitura para TV/telão, sem ações de edição.
- **Sessão**: unidade persistida no banco com estado do placar, histórico e configurações visuais.

### Fluxo recomendado

1. Criar sessão em `/placar-volei/sessoes`.
2. Abrir controle em `/placar-volei?sessionId=<id>`.
3. Compartilhar a view em `/placar-volei/view/<id>` (link ou QR Code).

### Sincronização em tempo real

- A view é atualizada em tempo real via **SSE (Server-Sent Events)**.
- Toda ação feita no controle é persistida na sessão e publicada no stream da sessão.

### Configurações de exibição (definidas no controle)

As opções abaixo são salvas na sessão e aplicadas na view:

- Cor de fundo e cor da fonte do card.
- Tamanho da fonte do nome do time.
- Tamanho da fonte do placar.
- Exibir/ocultar nome dos times na view.
- Exibir/ocultar indicadores de sets na view.
- Exibir/ocultar resumo dos sets na view.

### API REST

| Método | Endpoint | Descrição | Acesso |
|---|---|---|---|
| `GET` | `/api/miniapps` | Lista mini-apps ativas | Público |
| `GET` | `/api/admin/miniapps` | Lista todas as mini-apps | Autenticado |
| `POST` | `/api/admin/miniapps` | Cria uma nova mini-app | Autenticado |
| `GET` | `/api/admin/miniapps/[id]` | Busca mini-app por ID | Autenticado |
| `PATCH` | `/api/admin/miniapps/[id]` | Atualiza mini-app | Autenticado |
| `DELETE` | `/api/admin/miniapps/[id]` | Remove mini-app | Autenticado |
| `GET` | `/api/scoreboard-sessions` | Lista sessões de placar | Público |
| `POST` | `/api/scoreboard-sessions` | Cria nova sessão de placar | Público |
| `GET` | `/api/scoreboard-sessions/[id]` | Busca sessão por ID | Público |
| `PATCH` | `/api/scoreboard-sessions/[id]` | Aplica ação no placar/config da sessão | Público |
| `DELETE` | `/api/scoreboard-sessions/[id]` | Exclui sessão | Público |
| `GET` | `/api/scoreboard-sessions/[id]/stream` | Stream SSE com atualizações da sessão | Público |

## Estrutura do projeto

```
application-manager/
├── app/
│   ├── admin/                  # Painel administrativo
│   │   ├── AdminClient.tsx     # UI do CRUD (client component)
│   │   ├── MiniAppForm.tsx     # Formulário reutilizável
│   │   ├── layout.tsx          # Layout com verificação de sessão e logout
│   │   └── page.tsx            # Server component do admin
│   ├── api/
│   │   ├── admin/miniapps/     # Endpoints CRUD admin
│   │   ├── auth/[...nextauth]/ # Handler do Auth.js
│   │   ├── miniapps/           # Endpoint público
│   │   └── scoreboard-sessions/# Endpoints de sessão do placar + stream SSE
│   ├── login/                  # Tela de login
│   ├── placar-volei/           # Mini-app: placar de vôlei
│   │   ├── page.tsx            # Tela de controle
│   │   ├── sessoes/            # CRUD de sessões
│   │   └── view/[id]/          # Tela de visualização (somente leitura)
│   ├── [...slug]/              # Catch-all para rotas não implementadas
│   ├── layout.tsx              # Layout raiz com header
│   └── page.tsx                # Home pública
├── lib/
│   ├── miniapps.ts             # Camada de acesso a dados (MiniApp)
│   ├── prisma.ts               # Singleton do Prisma Client
│   ├── scoreboard.ts           # Estado/reducer/config do placar
│   ├── scoreboard-sessions.ts  # CRUD/aplicação de ações da sessão
│   ├── scoreboard-stream.ts    # Pub/sub em memória para SSE
│   └── validations.ts          # Schemas Zod
├── prisma/
│   ├── migrations/             # Histórico de migrations
│   ├── schema.prisma           # Modelos MiniApp e User
│   └── seed.ts                 # Script para criar o admin inicial
├── auth.ts                     # Configuração do Auth.js (Credentials provider)
├── proxy.ts                    # Proteção de rotas /admin (Next.js 16)
└── .env                        # Variáveis de ambiente (não versionado)
```

## Banco de dados

### Modelos

**MiniApp** (`mini_apps`)

| Campo | Tipo | Descrição |
|---|---|---|
| id | Int (PK) | Identificador |
| title | VarChar(100) | Nome exibido |
| path | VarChar(100) unique | Rota da aplicação (ex: `/placar-volei`) |
| description | Text | Descrição |
| active | Boolean | Visível na home quando `true` |
| createdAt | DateTime | Data de criação |
| updatedAt | DateTime | Data de atualização |

**User** (`users`)

| Campo | Tipo | Descrição |
|---|---|---|
| id | Int (PK) | Identificador |
| email | VarChar(255) unique | Email de acesso |
| password | VarChar(255) | Senha com hash bcrypt (custo 12) |
| name | VarChar(100) | Nome exibido no painel |
| createdAt | DateTime | Data de criação |

**ScoreboardSession** (`scoreboard_sessions`)

| Campo | Tipo | Descrição |
|---|---|---|
| id | String (PK) | Identificador único da sessão |
| title | VarChar(120) | Título da sessão |
| controlToken | String | Token opcional para controle da sessão |
| state | JSON | Estado completo do placar (times, sets, histórico e display) |
| archivedAt | DateTime nullable | Data de arquivamento lógico |
| createdAt | DateTime | Data de criação |
| updatedAt | DateTime | Data de atualização |

### Comandos Prisma úteis

```bash
# Criar e aplicar nova migration em desenvolvimento
npx prisma migrate dev --name nome-da-migration

# Abrir o Prisma Studio (visualizador de dados)
npx prisma studio

# Regenerar o Prisma Client após alterar o schema
npx prisma generate
```

## Autenticação

O painel `/admin` é protegido via Auth.js v5 com estratégia JWT. O proxy (`proxy.ts`) intercepta todas as requisições para `/admin/*` e redireciona usuários não autenticados para `/login?callbackUrl=<rota-original>`.

Após o login bem-sucedido, o usuário é redirecionado de volta à rota solicitada. O layout do admin exibe o nome do usuário logado e um botão de logout.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
