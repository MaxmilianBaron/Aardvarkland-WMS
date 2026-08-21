# Aardvarkland Live Frontend MCP

Repo-local MCP server pro testování frontendu tak, jako by ho používal skladník, vedoucí skladu nebo správce.

Server mluví MCP přes `stdio` a používá lokální Chrome nebo Edge přes Chrome DevTools Protocol. Nepotřebuje Docker ani Playwright.

## Co Umí

- `aardvark_health_check`
  - zkontroluje frontend `4000`, backend `/api/health` na `4001` a volitelně lokální panel `3002`
- `aardvark_role_journey`
  - spustí reálný prohlížeč
  - přihlásí se do UI
  - projde obrazovky podle role
  - umí ověřit jazyk `cs`, `en` nebo `ua`
  - ověří, že role vidí očekávané menu a nevidí zakázané položky
  - uloží screenshoty a JSON report do `MCP/reports/`
- `aardvark_skladnik_live_process`
  - simuluje skutečný provoz v UI
  - přihlásí pracovníka nebo vedoucího
  - zadá reálné hodnoty do formulářů
  - kliká stejné akce jako člověk ve skladu
  - zapisuje přes frontend do backendu
  - vyžaduje `confirmLiveWrite: true`
- `aardvark_full_stack_e2e`
  - vyžaduje bezpečnostní frázi `confirmResetDatabase: "RESET_LOCAL_WMS_DB"`
  - odmítne produkčně vypadající URL a běží jen proti localhostu
  - resetuje lokální/staging DB přes backend skript, importuje scénář a projede reálné UI zápisy
  - po UI akcích ověří backend stav, reload/role journey a terminal stav tiskové fronty
  - reportuje `setup`, `uiSteps`, `backendAssertions`, `reloadAssertions`, `terminalOrCleanupAssertions`, screenshoty, console/page errors a overflow
- `aardvark_shift_stress_e2e`
  - simuluje e-shop směnu: 1 vedoucí skladu a výchozích 10 skladníků
  - vyžaduje `confirmResetDatabase: "RESET_LOCAL_WMS_DB"` a `confirmStressRun: "RUN_30_MIN_WMS_SHIFT"`
  - před prvním UI kliknutím ověří všechny MCP účty přes backend login
  - před každou fází směny kontroluje backend readiness, aby výpadek API/DB nebyl zaměněn za špatné heslo
  - výchozí `runMode: "persistent"` drží jeden přihlášený prohlížeč pro každého aktéra
  - `readinessGate: "30m"` nebo `"60m"` vynutí software-only acceptance gate: 1 vedoucí, 10 skladníků, in-shift fake TCP 9100 tisk a multi-printer retry/failover
  - `runMode: "continuous"` spustí vedoucího a skladníky souběžně přes krátké relace bez plánovaných pauz
  - volitelný `runMode: "phased"` drží starší časovaný scénář s offsety fází
  - ukládá timeline vedoucího i skladníků, backend snapshoty, invariants, reload assertions, hardware-sim assertions, readiness assertions, latency a UI cleanup findings
- `aardvark_employee_frontend_audit`
  - projde všechny dostupné obrazovky vybraných rolí jako přihlášený zaměstnanec
  - počká na API/loading stavy před kontrolou formulářů a tlačítek
  - vyplní viditelná editovatelná pole bezpečnými testovacími hodnotami
  - sepíše stav tlačítek, blokovaných polí, overflow a případné API/page chyby
  - bez `confirmLiveWrite` nekliká destruktivní provozní akce; k zápisům slouží allowlistované live procesy
- `aardvark_ui_overflow_scan`
  - otevře UI a najde viditelné prvky, kde text nebo obsah přetéká mimo rámeček
- `aardvark_hardware_sim_lab`
  - spustí hybridní hardware lab bez fyzického skeneru a tiskárny
  - zadává scanner-like hodnoty do RF inputu přes CDP keyboard wedge
  - ověřuje scan resolver backendu pro `AARD1`, GS1 a raw fallback
  - spustí fake TCP 9100 listener, zařadí cílený ZPL print job, provede print-agent claim/report a uloží captured `.zpl`
  - ověří multi-printer retry/failover: primární fake tisk selže, job se retryne, přesměruje na druhou tiskárnu, primární agent ho už nesmí claimnout a sekundární fake TCP tisk ho vytiskne
  - defaultně renderuje offline artefakty v `MCP/reports/`; Labelary je volitelný a vypnutý, dokud není explicitně povolený

## Role

- `skladnik`
  - kontroluje skenování, úkoly, příjem, balení, zásoby a provozní tisk
- `vedouci`
  - kontroluje provozní přehled, objednávky, úkoly, příjem, zásoby, balení, dopravu, integrace, tiskárny a skenery
- `spravce`
  - kontroluje nastavení, přehled, integrace a tiskárny

Výchozí bezpečný režim je nedestruktivní. Nástroj nic nepřidává, nemaže ani neposílá skladové potvrzení.

`aardvark_skladnik_live_process` je výjimka: umí dělat reálné zápisy, ale jen když výslovně pošlete `confirmLiveWrite: true`.

`aardvark_full_stack_e2e` je ještě přísnější výjimka: smí resetovat pouze lokální
nebo staging databázi a vyžaduje přesnou frázi `RESET_LOCAL_WMS_DB`.

## Přihlašovací Údaje

Lokální fallback pro neprodukční prostředí:

- skladník: `mcp-skladnik@aardvarkland.local`
- vedoucí: `mcp-vedouci@aardvarkland.local`
- správce: `mcp-spravce@aardvarkland.local`
- heslo: `Mcp-Local-42!`

Směnový stress test používá navíc:

- vedoucí směny: `mcp-vedouci-shift@aardvarkland.local`
- skladníci: `mcp-skladnik-01@aardvarkland.local` až `mcp-skladnik-10@aardvarkland.local`
- správce setupu: `mcp-spravce@aardvarkland.local`
- heslo: stejné lokální MCP heslo jako výše

Fallback účty vytváří seed mimo produkci. Env proměnné je možné použít pro přepsání:

```powershell
$env:AARDVARK_MCP_SKLADNIK_LOGIN="mcp-skladnik@aardvarkland.local"
$env:AARDVARK_MCP_SKLADNIK_PASSWORD="..."
$env:AARDVARK_MCP_VEDOUCI_LOGIN="mcp-vedouci@aardvarkland.local"
$env:AARDVARK_MCP_VEDOUCI_PASSWORD="..."
$env:AARDVARK_MCP_SPRAVCE_LOGIN="mcp-spravce@aardvarkland.local"
$env:AARDVARK_MCP_SPRAVCE_PASSWORD="Mcp-Local-42!"
```

## Spuštění Smoke Testu

```powershell
cd "C:\Aardvarkland Inc\Aardvarkland WMS\WMS-Server\MCP"
npm run smoke
```

## Spuštění Role Matice

```powershell
cd "C:\Aardvarkland Inc\Aardvarkland WMS\WMS-Server\MCP"
npm run role:journeys -- --screenshots=false
```

Výchozí matice projde `skladnik`, `vedouci` a `spravce` v `cs`, `en` a `ua` na
`1440x960` a `390x844`.

## Připojení Do MCP Klienta

Command:

```powershell
node "C:\Aardvarkland Inc\Aardvarkland WMS\WMS-Server\MCP\server.mjs"
```

Příklad konfigurace:

```json
{
  "mcpServers": {
    "aardvarkland-live-frontend": {
      "command": "node",
      "args": ["C:\\Aardvarkland Inc\\MCP\\server.mjs"],
      "env": {
        "AARDVARK_MCP_SPRAVCE_LOGIN": "mcp-spravce",
        "AARDVARK_MCP_SPRAVCE_PASSWORD": "Mcp-Local-42!"
      }
    }
  }
}
```

## Před Role Journey

Musí běžet:

- frontend: `http://localhost:4000`
- backend: `http://localhost:4001/api`
- lokální PostgreSQL podle běžného root spouštěče

Pak může MCP spustit například:

```json
{
  "role": "spravce",
  "language": "ua",
  "frontendUrl": "http://localhost:4000",
  "backendUrl": "http://localhost:4001/api",
  "screenshots": true
}
```

## Employee Frontend Audit

Pro praktickou kontrolu UI ve stylu „jsem zaměstnanec v provozu“ použij:

```json
{
  "roles": ["skladnik", "vedouci", "spravce"],
  "languages": ["cs", "ua"],
  "viewports": [
    { "width": 1440, "height": 960 },
    { "width": 390, "height": 844 }
  ],
  "frontendUrl": "http://localhost:4000",
  "backendUrl": "http://localhost:4001/api",
  "fillControls": true,
  "failOnOverflow": true,
  "screenshots": true
}
```

Výstup ukládá report a screenshoty do `MCP/reports/`. Report obsahuje každou
route, počet vyplněných polí, stav tlačítek, API chyby, page errors a overflow.
Výchozí `failOnOverflow: true` znamená, že přetečený text shodí report stejně
jako API chyba.
Skutečné zápisové procesy spouštěj přes `aardvark_skladnik_live_process`, protože
tam jsou destruktivní akce záměrně na allowlistu.

## Reálné Procesy V UI

Live-process tool umí tyto procesy:

- `inbound_receive`
  - vybere ASN, vyplní řádek a množství, klikne `Přijmout řádek`
- `inventory_receive`
  - vybere SKU/řádek zásob, vyplní množství, klikne `Přijmout zásobu`
- `inventory_move`
  - vybere SKU/řádek zásob, vyplní množství a cílovou lokaci, klikne `Přesunout`
- `inventory_adjust`
  - vybere SKU/řádek zásob, vyplní množství, klikne `Upravit +ks`
- `task_claim_start_confirm`
  - převezme další úkol, spustí ho a potvrdí hotovo
- `rf_scan_expected_steps`
  - spustí RF relaci a opakovaně vyplní očekávaný sken jako pracovník se skenerem
- `packing_scan_and_ship`
  - zadá skeny položek, vytvoří balík, vygeneruje štítek a volitelně odešle zásilku
- `label_preview_and_queue`
  - otevře tiskárny, vyplní reálný kód štítku, vytvoří náhled a zařadí tiskový úkol do fronty
- `print_setup_and_label_queue`
  - přes UI uloží tiskárnu, volitelně tiskového agenta, vytvoří náhled štítku a zařadí tiskový úkol do fronty
- `outbound_allocate`
  - vybere objednávku a alokuje ji přes UI
- `outbound_release_picking`
  - vybere alokovanou objednávku a uvolní picking přes UI
- `wave_release`
  - vybere vlnu a uvolní ji přes UI
- `settings_create_user`
  - vytvoří testovacího uživatele přes správce/vedoucí nastavení

## Full-Stack E2E S Resetem DB

Backend má bezpečné skripty pro MCP DB reset a import scénáře:

```powershell
cd "C:\Aardvarkland Inc\Aardvarkland WMS\WMS-Server\backend"
npm run db:reset:mcp
npm run db:import:mcp-scenario
```

Oba skripty odmítnou `NODE_ENV=production` a non-local `DATABASE_URL`.

Příklad MCP full-stack běhu:

```json
{
  "confirmResetDatabase": "RESET_LOCAL_WMS_DB",
  "frontendUrl": "http://localhost:4000",
  "backendUrl": "http://localhost:4001/api",
  "scenarioPath": "MCP/scenarios/eshop-electro-lite.json",
  "language": "cs",
  "viewport": { "width": 1440, "height": 960 },
  "screenshots": true
}
```

Tenhle běh používá stabilní `data-testid` a `data-mcp-action` selektory, takže
není závislý na českém, anglickém ani ukrajinském viditelném textu.
Aktuální scénář pokrývá příjem ASN, zásoby receive/move/adjust, RF skenovací
workflow, alokaci a release pickingu, potvrzení konkrétních pick tasků, balení,
generování štítku, tiskovou frontu s agent claim/report simulací a vytvoření
uživatele ve správě.

## Směnový Stress Test

Pro realistický provoz e-shop skladu použij scénář `eshop-electro-shift-30m`.
Test resetuje lokální DB, nahraje 50 SKU, více lokací, 3 ASN a 30 objednávek.
Vedoucí alokuje a uvolňuje práci, deset skladníků paralelně dělá příjem,
přesuny, picking, RF skeny, balení, replenishment, tisk štítků a výjimky.
Výchozí režim je `persistent`, takže každý aktér drží vlastní přihlášený
prohlížeč po celou směnu. Režim `continuous` používá krátké relace pro paralelní
fronty práce. Režim `phased` slouží jen pro starší časovanou variantu.

CLI zkratka:

```powershell
cd "C:\Aardvarkland Inc\Aardvarkland WMS\WMS-Server\MCP"
npm run shift:stress -- --duration-minutes=30 --workers=10 --screenshots=false --audit=false --hardware-lab=true
```

Software-only readiness gate pro pilotní přípravu:

```powershell
cd "C:\Aardvarkland Inc\Aardvarkland WMS\WMS-Server\MCP"
npm run shift:gate30
npm run shift:gate60
```

Oba gate skripty používají 1 vedoucího, 10 skladníků, reset lokální DB,
`runMode=persistent`, in-shift hardware simulator/fake print a report assertions
pro multi-printer retry/failover. `shift:gate60` je delší soak varianta stejné
brány.

Rychlý smoke běh:

```powershell
cd "C:\Aardvarkland Inc\Aardvarkland WMS\WMS-Server\MCP"
npm run shift:stress -- --duration-minutes=0.1 --screenshots=false --audit=false
```

Report ukládá `setup.actorCredentials`, `setup.healthTimeline`,
`managerTimeline`, `workerTimelines`, `backendSnapshots`, `backendAssertions`,
`reloadAssertions`, `terminalStateAssertions`, `readinessAssertions`, `latency`,
`consoleErrors`, `pageErrors` a `overflowCount`. Gate běh selže, pokud
`readinessAssertions` nepotvrdí délku 30/60 minut, aktéry 1+10, fake TCP tisk,
multi-printer failover a backend invarianty.

## Hardware Simulator Lab

Hybridní hardware simulátor je dev/test cesta pro skener a ZPL tiskárnu. Nemění
produkční tok: v produkci zůstává scanner jako USB/Bluetooth keyboard wedge
nebo Zebra DataWedge a tisk přes backend print queue -> Print Agent -> TCP 9100
nebo Windows RAW.

CLI:

```powershell
cd "C:\Aardvarkland Inc\Aardvarkland WMS\WMS-Server\MCP"
npm run hardware:sim -- --render-mode=offline --fake-printer-port=19100
```

Lokální web UI:

```powershell
cd "C:\Aardvarkland Inc\Aardvarkland WMS\WMS-Server\MCP"
npm run hardware:ui
```

Panel poběží na `http://127.0.0.1:3010` a umí pustit samostatný scan nebo celý
lab. Výstupy jsou v `MCP/reports/...`: scan log, captured `.zpl`, offline
preview `.svg/.html`, volitelný Labelary `.png`, backend assertions a stav
print-agent claim/report. Součástí reportu je `multiPrinterFailover`, který
jasně ukazuje primární selhání, retry, reassign na sekundární tiskárnu,
blokovaný claim špatným agentem a finální fake TCP capture.

Když je RF fronta prázdná, lab si pro lokální běh umí vytvořit krátký `MOVE`
task (`ensureRfTask=true`), aby byl RF scanner input aktivní a CDP keyboard
wedge opravdu prošel přes WMS UI.

Labelary render posílá ZPL mimo lokální počítač, proto je vypnutý defaultně:

```powershell
npm run hardware:sim -- --render-mode=both --allow-external-labelary=true
```

Příklad příjmu přes UI:

```json
{
  "role": "skladnik",
  "process": "inbound_receive",
  "confirmLiveWrite": true,
  "loginName": "skladnik",
  "passwordEnv": "AARDVARK_MCP_SKLADNIK_PASSWORD",
  "data": {
    "asnReference": "ASN-1001",
    "lineReference": "1",
    "quantity": 3
  }
}
```

## Provozní Scénáře Bez Demo Dat

Realistická testovací data patří do `MCP/scenarios/`, ne přímo do frontendu.

- `MCP/scenarios/eshop-electro-lite.json` obsahuje první skladový model pro menší e-shop.
- Scénář je anonymní a vlastní, aby se nepoužívala cizí zákaznická data bez souhlasu.
- Další krok je udělat import scénáře do lokální databáze a pak ho projet přes `aardvark_skladnik_live_process`.

Příklad přesunu zásob přes UI:

```json
{
  "role": "skladnik",
  "process": "inventory_move",
  "confirmLiveWrite": true,
  "loginName": "skladnik",
  "passwordEnv": "AARDVARK_MCP_SKLADNIK_PASSWORD",
  "data": {
    "sku": "SKU-001",
    "quantity": 1,
    "targetLocation": "TEST-LOC-01"
  }
}
```
