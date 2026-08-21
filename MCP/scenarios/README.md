# MCP Provozní Scénáře

Tahle složka je určená pro realistické testy přes MCP. Data odsud se nemají automaticky zobrazovat ve frontendu. UI má ukazovat jen to, co vrátí backend.

## Princip

- žádná fake data přímo ve frontendu
- žádné cizí zákaznické údaje bez souhlasu
- realistické zboží, lokace a objednávky držet jako oddělené scénáře
- MCP má scénář zapsat přes backend nebo přes UI, stejně jako by pracoval skladník

## Doporučený postup

1. Vybrat typ reálného provozu: e-shop, malý sklad, 3PL, B2B distribuce.
2. Připravit anonymní sortiment a objednávky podle skutečné logiky skladu.
3. Nahrát scénář do lokální databáze.
4. Spustit MCP role journey pro `skladnik`, `vedouci`, `spravce`.
5. Spustit live procesy: příjem, přesun zásob, úkoly, balení, štítek.

`eshop-electro-lite.json` je první modelový scénář pro menší e-shop se spotřební elektronikou a příslušenstvím.

`hardware-labels-lite.json` je scénář pro ověření skenů, QR/čárových kódů,
náhledu štítku a fake TCP 9100 tisku bez fyzické tiskárny. Používá ho
`aardvark_hardware_sim_lab`; payloady pokrývají `AARD1:LOC`, `AARD1:SKU`,
`AARD1:HU`, `AARD1:PARCEL`, `AARD1:TASK`, GS1 a raw fallback, včetně Enter/Tab
terminátorů pro keyboard-wedge chování.

`eshop-electro-shift-30m.json` obsahuje software-only readiness gate konfiguraci
pro 30min a 60min běh: 1 vedoucí skladu, 10 skladníků, persistent relace,
in-shift hardware simulátor/fake TCP tisk a multi-printer retry/failover
assertion. Fyzický scanner ani tiskárna se tím neoznačují jako ověřené.
