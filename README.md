# Enxoval de Casa Nova

Aplicação React + Express para organizar itens do enxoval por categoria, com login e persistência em PostgreSQL.

## Requisitos

- Node.js
- Banco PostgreSQL

## Configuração local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie um `.env` com a conexão do banco:

   ```bash
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
   PORT=3000
   ```

3. Crie as tabelas no banco:

   ```bash
   npm run db:migrate
   ```

4. Rode o projeto:

   ```bash
   npm run dev
   ```

A aplicação fica disponível em `http://localhost:3000`.

## Scripts

- `npm run dev`: inicia Express + Vite em desenvolvimento.
- `npm run db:migrate`: cria/atualiza as tabelas necessárias.
- `npm run build`: gera o frontend e o servidor em `dist/`.
- `npm run start`: executa o build de produção.
- `npm run lint`: executa o typecheck TypeScript.