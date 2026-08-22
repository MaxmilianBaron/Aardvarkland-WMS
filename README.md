# Aardvarkland WMS

Self-hosted warehouse software for receiving, stock control, picking, packing and shipping. The application uses a React frontend, a NestJS API and PostgreSQL.

[Live Preview](https://maxmilianbaron.github.io/Aardvarkland-WMS/) · [WMS Mini](https://github.com/MaxmilianBaron/Aardvarkland-WMS-Mini)

The preview runs in the browser with sample data. This repository contains the full application.

## What it does

- products, warehouses, locations and stock
- receiving, putaway and cycle counts
- allocation, wave picking, packing and shipping
- worker, manager and administrator roles
- keyboard, camera and RF barcode workflows
- label templates, print queues and a local ZPL print agent
- alerts, incidents, analytics and audit exports
- Czech, English, Ukrainian, French, German and Spanish UI

## Run with Docker

Requires Docker Desktop with Compose.

```bash
git clone https://github.com/MaxmilianBaron/Aardvarkland-WMS.git
cd Aardvarkland-WMS
docker compose up --build
```

- Frontend: `http://localhost:4000`
- API: `http://localhost:4001/api`

The first start applies the database migrations and creates a local administrator account:

- Email: `admin@example.com`
- Password: `Local-Seed-42!`

Change `ADMIN_INITIAL_PASSWORD`, `POSTGRES_PASSWORD` and the application secrets before using WMS outside local development.

## Local development

Requires Node.js 24.15+ and PostgreSQL 18.
Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` before running the database commands.

```bash
cd backend
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run db:seed
npm run start:dev
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Replace all development placeholders before using a shared environment. Production options are documented in [`backend/.env.production.example`](backend/.env.production.example).

## Checks

```bash
cd backend && npm run verify
cd ../frontend && npm run typecheck && npm run lint && npm test && npm run build
cd ../print-agent && npm ci && npm run check
```

Scanner and printer checks still need real hardware.

## Repository layout

- `backend/` — API, database schema and tests
- `frontend/` — web application and PWA shell
- `print-agent/` — local ZPL printer bridge
- `demo/` — GitHub Pages preview
- Security reports: [SECURITY.md](SECURITY.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[MIT](LICENSE)
