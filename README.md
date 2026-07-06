# Nexus Collection Builder

MVP em Next.js para criar uma interface web onde o usuário valida uma Nexus API Key, busca mods, vê detalhes, escolhe arquivos/versões, monta uma collection e gera/publica um manifesto.

## O que já está implementado

- Site em Next.js/React com tema dark roxo inspirado na UI planejada.
- Entrada de API Key com armazenamento em cookie `HttpOnly` criptografado.
- Seleção de jogo por `game_domain_name`.
- Busca de mods por URL/ID e busca textual configurável.
- Cards com thumb, nome, autor, downloads, endorsements e versão.
- Tela de detalhes do mod.
- Modal de seleção de arquivos: Main, Optional, Old e Misc.
- Builder da collection com install order, status e remoção.
- Geração de manifesto JSON da collection.
- Endpoint isolado para publicação da Collection.
- Mock mode para testar a UI sem usar Nexus API real.

## Telas do app

1. Entrada / API Key
2. Escolher jogo
3. Buscar mods
4. Detalhes do mod
5. Selecionar arquivo
6. Minha Collection
7. Publicar Collection
8. Resultado da publicação

## Rodando localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abra:

```txt
http://localhost:3000
```

Por padrão o `.env.example` usa:

```env
NEXUS_MOCK_MODE="true"
```

Assim o projeto funciona com dados fake para testar a UI.

## Usando com Nexus API real

No `.env.local`:

```env
NEXUS_MOCK_MODE="false"
NEXUS_SESSION_SECRET="uma-chave-grande-e-aleatoria-com-32-ou-mais-caracteres"
NEXUS_API_BASE="https://api.nexusmods.com/v1"
```

A validação da API Key usa:

```txt
GET /users/validate.json
```

Detalhes do mod usa:

```txt
GET /games/{game}/mods/{mod_id}.json
```

Arquivos do mod usa:

```txt
GET /games/{game}/mods/{mod_id}/files.json
```

A busca textual depende do endpoint de search disponível na documentação atual da Nexus. Configure:

```env
NEXUS_SEARCH_URL_TEMPLATE=""
```

Placeholders aceitos:

```txt
{base}
{game}
{q}
{page}
{sort}
{category}
```

Exemplo de uso se a documentação atual definir uma rota de search:

```env
NEXUS_SEARCH_URL_TEMPLATE="{base}/games/{game}/mods/search.json?terms={q}&page={page}&sort={sort}&category={category}"
```

> Ajuste essa URL exatamente conforme o endpoint de search da documentação atual.

## Publicação de Collections

A UI gera um manifesto com:

```txt
game
mod_id
file_id
version
install_order
required
metadata da collection
```

A publicação real fica isolada em:

```txt
lib/nexus-collections.ts
```

Isso é proposital: os endpoints de Collections/Upload podem variar conforme a versão atual da documentação da Nexus. Para ativar publicação real, configure os templates no `.env.local`:

```env
NEXUS_UPLOAD_SESSION_URL_TEMPLATE=""
NEXUS_UPLOAD_FINALIZE_URL_TEMPLATE=""
NEXUS_COLLECTION_CREATE_URL_TEMPLATE=""
NEXUS_COLLECTION_REVISION_URL_TEMPLATE=""
NEXUS_COLLECTION_PUBLISH_URL_TEMPLATE=""
```

No modo mock, clicar em Publish retorna uma URL fake e o manifesto gerado.

## Estrutura

```txt
app/
  page.tsx                          UI principal
  globals.css                       Tema e componentes visuais
  api/
    auth/validate-key               Valida API Key
    auth/logout                     Remove sessão
    games                           Lista jogos comuns
    mods/search                     Busca mods
    mods/resolve                    Resolve link da Nexus
    mods/[game]/[modId]             Detalhes do mod
    mods/[game]/[modId]/files       Arquivos do mod
    collections/manifest            Gera manifesto
    collections/publish             Publica collection
lib/
  nexus.ts                          Cliente Nexus + normalizadores
  nexus-collections.ts              Camada isolada de publicação
  manifest.ts                       Geração/validação do manifesto
  session.ts                        Cookie seguro da API key
  games.ts                          Jogos pré-cadastrados
  types.ts                          Tipos compartilhados
```

## Segurança

- A API Key não fica no `localStorage`.
- A API Key não é enviada diretamente para a Nexus pelo navegador.
- Todas as chamadas Nexus passam pelo backend.
- Em produção, use HTTPS e uma `NEXUS_SESSION_SECRET` forte.
- Para app público, o ideal é migrar para OAuth/login oficial se a Nexus oferecer esse fluxo.
