# Aardvarkland audit

Datum: 2026-05-19

Aktualizace 2026-05-22: probehla prvni pilotni hardening vlna pro maly
on-prem Windows pilot. Produkcni secret/config hardening, CSP, dependency
audity, lockfile pro `print-agent`, Vite 8 build warning fix, lokace/
putaway, kvalita/vratky/karantena, inventury, multi-printer queue akce a RF
scanner assignment jsou dodelane. Fyzicky scanner/tiskarna, restore drill a
Windows service acceptance zustavaji otevrene.

## Metodika

Pocital jsem ciste radky kodu jako neprazdne radky bez beznych jedno-radkovych
komentaru. Do cisel nejsou zahrnute `node_modules`, `dist`, logy, lokalni
PostgreSQL data, Python `__pycache__` a generovany Prisma klient v
`backend/src/generated`.

## Ciste radky kodu

| Cast | Soubory | Ciste radky |
| --- | ---: | ---: |
| Backend celkem | 538 | 61 616 |
| Backend `src` bez generovaneho Prisma klienta | 526 | 57 359 |
| Backend Prisma schema + seed | 2 | 3 957 |
| Backend lokalni DB skripty | 3 | 129 |
| Frontend celkem | 68 | 6 513 |
| Frontend `src` | 64 | 6 400 |
| Frontend server/config | 3 | 106 |
| Root launchery a local panel | 19 | 796 |

## Backend

Technologie:

- NestJS 11
- Prisma 7
- PostgreSQL
- JWT auth, role/permission access control
- Swagger dependencies
- local embedded PostgreSQL pro vyvoj bez Dockeru

Rozsah:

- 75 controller dekoratoru
- 364 route dekoratoru
- 121 Prisma modelu
- 60 Prisma enumu

Backend umi:

- autentizaci, refresh tokeny, MFA strukturu, role a opravneni,
- klienty/3PL ownership, rate cards, fakturacni udalosti, faktury a credit notes,
- sklady, lokace, produkty, SKU, obaly, UOM, ownership,
- inbound, outbound, alokace, fulfillment, warehouse tasks,
- inventory, stock movements, reservations, freezes,
- wave picking, putaway, replenishment, slotting,
- packing, shipping, carrier labels, tracking, manifests,
- RF workflows, offline queue, scanner sessions,
- returns, quality, cycle counts, traceability, serial/lot evidence,
- configuration rules, workflow validation,
- integrations, EDI, outbox/inbox, idempotency, dead letters,
- observability, health, runtime metrics,
- enterprise ops/value/platform mock/runtime surfaces.

Pouzitelnost:

- Technicky je backend spustitelny lokalne bez Dockeru.
- Ma realnou domenu WMS/3PL a velky API povrch.
- Je vhodny pro demo, interní prototyp a pilotni validaci procesu.
- Neni jeste hotovy jako bezpecne provozovany produkt pro zakazniky bez dalsiho
  hardeningu.

Do skutecneho provozu jeste potrebuje:

- produkcni deployment rezim jako Windows service nebo Linux systemd/container,
- spravu tajemstvi, silne produkcni JWT/secrets a rotaci,
- HTTPS/reverse proxy a CORS podle domen zakaznika,
- stabilni PostgreSQL instalaci, zalohy, restore testy a migracni proces,
- vice integračních/E2E testu nad realnou DB,
- load/performance testy pro skladove spicky,
- audit a bezpecnostni testy pro roles/permissions,
- realne certifikovane integrace s dopravci, tiskarnami, EDI a e-shop platformami,
- monitoring, log retention, alerting a incident postupy,
- servisni instalator/update mechanismus pro zakaznika.

## Frontend

Technologie:

- React 19
- Vite 8
- TypeScript
- hash routing
- custom UI komponenty a API klient

Rozsah:

- 21 navigacnich route klicu
- produkcni build: JS cca 344 kB, gzip cca 102 kB
- CSS cca 46 kB, gzip cca 9 kB

Frontend umi:

- dashboard/overview,
- inbound, inventory, outbound, tasks, waves,
- RF terminal a RF mobile,
- packing, carriers/shipments,
- control tower, integrations, EDI,
- print stations, returns, layout, labor, billing,
- client portal, configuration rules, settings,
- API klient s mapou endpointu a fallback/mock daty.

Pouzitelnost:

- Je spustitelny a sestavitelny.
- Je dobry pro demonstraci produktu a praci s navrzenymi workflow.
- Cast stranek je napojena na API, cast pouziva fallback/mock data.
- Pro pilot je pouzitelny, ale pro placeny provoz potrebuje dopracovat realne
  okraje workflow a UX.

Do skutecneho provozu jeste potrebuje:

- doplnit E2E testy kritickych procesu,
- lepsi empty/loading/error stavy na vsech obrazovkach,
- overit role/permission UX napric strankami,
- mobile/RF testy na realnych zarizenich,
- doladit formulare, validace a chybove hlasky,
- oddelit demo/fallback data od produkcniho rezimu,
- pripravit instalacni/hosting model pro zakazniky.

## Validace provedena

- Backend `npm run typecheck`: OK
- Backend `npm test`: OK, 4/4 testy
- Backend `npm run build`: OK
- Frontend `npm run typecheck`: OK
- Frontend `npm run build`: OK

Aktualizace 2026-05-22: backend `npm run verify`, frontend `npm run lint`,
`npm test`, `npm run build`, print-agent `npm run check` a dependency audity pro
`backend`, `frontend` a `print-agent` prosly. `config.js` je nacitany jako
`type="module"` a produkcni frontend build uz nehlasi drivejsi chunk/config
warning.

## Port 5432

`localhost:5432` neni webova stranka. Je to standardni port PostgreSQL databaze.
Backend se na nej pripojuje pres `DATABASE_URL` a uklada/cte tam data aplikace.

V prohlizeci se `localhost:5432` nema zobrazovat jako UI. Pokud chces databazi
videt v prohlizeci, pouzij napriklad Prisma Studio:

```bat
cd backend
npm run prisma:studio
```

Prisma Studio obvykle otevre vlastni webovy port, casto `localhost:5555`, a pres
nej se da prohlizet obsah tabulek. V produkci by port `5432` nemel byt verejne
pristupny z internetu; ma byt dostupny jen backendu nebo administratorovi.
