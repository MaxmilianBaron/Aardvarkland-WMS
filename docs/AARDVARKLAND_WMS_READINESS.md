# Aardvarkland WMS Readiness

Datum: 2026-05-22

## Zaver

Aardvarkland WMS ma na small/midsize sklad silny backendovy zaklad:
inbound, lokace, inventory, rezervace, tasky, picking, packing, shipping,
RF, labely, print agent, cycle count, replenishment, returns, quality,
traceability, integrations, audit, idempotency, health a role/permissions.

Nejvetsi zbyvajici mezery jsou ted ve fyzickem a provoznim overeni:
restore drill, Windows service/restart policy, monitoring/alerting, zatezovy
30min provozni test s hardware labem a realny scanner + tiskarna. Frontendova
prvni vlna pro produktovy master, lokace/putaway, cycle count, returns/quality
a multi-printer obsluhu je doplnena.

## Must-Have Pro Pouzitelny Small/Midsize WMS

- Produkt/SKU master: produkt, SKU, barcode, UOM, baleni, vaha/rozmery.
- Prijem: ASN/PO, staging, rozdily, poskozeni, sarze/serialy.
- Lokace a putaway: hierarchie skladu, zony, receiving, storage, picking,
  packing, staging, shipping, quarantine; navrh cilove lokace.
- Inventory: zasoba podle SKU, lokace, statusu, sarze/serialu, rezervace a
  audit pohybu.
- Picking: single order, wave/batch, RF potvrzeni lokace, polozky a mnozstvi.
- Packing/shipping: kontrola obsahu, baliky, stitky, tracking, ship confirm.
- Replenishment: minimalne min/max doplneni pick lokaci.
- Cycle counting: plan, provedeni, rozdily, schvaleni korekce.
- Returns/quality: vratka, kontrola, restock/quarantine/scrap.
- Traceability: odkud polozka prisla, kde byla, kdo ji presunul, kam odesla.
- Hardware: keyboard-wedge/DataWedge skenery, ZPL tisk, print queue, print agent,
  realny audit a reprint.
- Bezpecnost: backend RBAC/ABAC, object-level permissions, audit log, idempotency,
  rate limiting, secret hygiene a hashed API/agent tokeny.
- Stabilita: health live/ready/startup, durable jobs, backup/restore, monitoring,
  SLO/RTO/RPO, runbooky a alerty.
- UI: role-specific obrazovky, scan-first RF, rychla validace po scanu,
  lokalizace CS/EN/UA/FR/DE/ES a WCAG 2.2 AA jako cil.

## Co Bylo Dodelano V Tomto Passu

- Frontend ma novou stranku `Produkty a SKU` napojenou na skutecne backend API
  pro list/create produktu a SKU.
- Frontend ma nove provozni stranky `Lokace`, `Kvalita` a `Inventury`
  napojene na skutecne backend API pro lokace/putaway, vratky/kontrolu/
  karantenu a cycle-count plany/ukoly.
- `product.read` byl pridan do pracovnich roli, aby produktovy master nebyl
  jen skryty backendovy povrch.
- Vedouci skladu ma v seed sablone `cycle-count.read` a `cycle-count.manage`.
- Mutace pro produkty a product-master ted spadaji pod povinne `Idempotency-Key`.
- Print Agent posila backendu seznam obsluhovanych tiskaren.
- Backend routuje claim print jobu podle tiskaren prirazenych agentovi nebo
  reportovanych agentem; legacy agent bez mapovani zustava kompatibilni.
- UI tiskovych agentu umi zobrazit a nastavit seznam tiskaren agenta.
- Tiskova fronta ve frontend UI umi filtrovani podle tiskarny a akce
  `retry`, `cancel`, `reassign` a `reprint` pres backend.
- RF UI pouziva konfigurovatelnou referenci skeneru/pracoviste misto pevneho
  `SCAN-01`.
- Frontend uz nepridava opravneni z lokalnich role profilu; zobrazuje jen to,
  co prijde z backend session.
- Backend readiness pocita i runtime print queue `wms_print_jobs`, pokud tabulka
  existuje.
- Produkcni hardening pridal produkcni compose example, generator secretu,
  validaci zakazanych placeholder secretu, CSP/security headers, lockfile pro
  `MCP` a `print-agent`, ciste dependency audity a Windows on-prem runbook.
- Frontend build bezi na Vite 8, `config.js` je `type="module"` a drivejsi
  chunk/config warning se v produkcnim buildu neobjevuje.

## Dalsi Nejvyssi Priority

1. Provest restore drill do neprodukcni databaze a ulozit vysledek do
   provozni dokumentace.
2. Dodelat Windows service/restart policy pro backend, frontend/serve a
   print-agent na pilotnim stroji.
3. Monitoring dashboard a alerty: API, DB, queue, print agents, failed jobs,
   outbox age a backup age.
4. Spustit 30min MCP provozni test: 1 vedouci + 10 skladniku, RF scan flow,
   hardware sim lab, fake TCP 9100 tisk, vice tiskaren, retry/failover.
5. RF cycle-count workflow dotahnout primo do scanner-first obrazovky, pokud se
   bude v pilotu pocitat fyzicky pres handheld.
6. Fyzicky hardware acceptance: vytisknout ZPL stitek, naskenovat ho zpet do WMS.

## Primarni Zdroje

- Microsoft Dynamics 365 Warehouse management:
  https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/warehouse-management-overview
- Odoo Inventory a Barcode:
  https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory.html
- Oracle NetSuite WMS:
  https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_156382517509.html
- GS1 barcodes, General Specifications, SSCC a logistics label:
  https://www.gs1.org/standards/barcodes
  https://ref.gs1.org/standards/genspecs/
  https://www.gs1.org/standards/id-keys/sscc
  https://www.gs1.org/standards/gs1-logistic-label-guideline/1-3
- Zebra DataWedge a ZPL:
  https://techdocs.zebra.com/datawedge/latest/guide/about/
  https://techdocs.zebra.com/datawedge/13-0/guide/output/keystroke/
  https://docs.zebra.com/us/en/printers/software/zpl-pg.html
- OWASP ASVS, API Security a Cheat Sheets:
  https://owasp.org/www-project-application-security-verification-standard/
  https://owasp.org/API-Security/editions/2023/en/0x00-header/
  https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
  https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
  https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- NIST SSDF a Digital Identity:
  https://csrc.nist.gov/pubs/sp/800/218/final
  https://pages.nist.gov/800-63-4/sp800-63b.html
- W3C WCAG 2.2:
  https://www.w3.org/TR/wcag/
- Google SRE SLO a monitoring:
  https://sre.google/sre-book/service-level-objectives/
  https://sre.google/sre-book/monitoring-distributed-systems/
- PostgreSQL backup/restore:
  https://www.postgresql.org/docs/current/backup.html
  https://www.postgresql.org/docs/current/continuous-archiving.html
