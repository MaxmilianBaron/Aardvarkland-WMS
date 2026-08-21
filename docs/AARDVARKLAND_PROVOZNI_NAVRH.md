# Aardvarkland Storage System - provozni navrh

## Doporuceny smer

Pro vyvoj ted nepouzivat Docker jako nutnou podminku. Frontend ma bezet lokalne na
`localhost:4000`, backend na `localhost:4001` a databaze jako lokalni PostgreSQL
spoustena skriptem z backendu.

Docker zustava uzitecny jako volitelna cesta pro pozdejsi nasazeni u zakazniku,
kteri maji vlastni IT a umi Docker provozovat. Nemel by ale blokovat vyvoj ani
male zakazniky, kteri chteji jednoduche "spustit a pouzivat".

## Proc

- Docker Desktop na Windows vyzaduje virtualizaci. Kdyz neni zapnuta v BIOS/UEFI,
  aplikace se nespusti.
- Mensi sklady a e-shopy casto nemaji cloveka, ktery bude resit Docker, WSL,
  virtualizaci a porty.
- Pro pilotni provoz je lepsi mit jednoduchy Windows launcher a lokalni databazi.
- Backend a frontend Docker nepotrebuji principialne. Potrebuji Node.js proces,
  webovy port a databazi.

## Aktualni lokalni vyvoj

- Frontend: `http://localhost:4000`
- Backend: `http://localhost:4001`
- Backend health: `http://localhost:4001/api/health`
- Lokalni panel: `http://localhost:3002`
- Databaze: lokalni PostgreSQL na `localhost:5432`
- Data lokalni databaze: `backend/.local-postgres/data`

Hlavni spoustec:

```bat
Start Aardvarkland Storage System.bat
```

Hlavni spoustec startuje backend, lokalni PostgreSQL, frontend a lokalni panel
skryte na pozadi. V prohlizeci se otevira `http://localhost:3002`, kde je videt
stav sluzeb a posledni logy misto otevrenych PowerShell oken.

Hlavni vypinac:

```bat
Stop Aardvarkland Storage System.bat
```

## Doporucene varianty pro zakazniky

### 1. Aardvarkland Cloud

Nejjednodussi varianta pro male e-shopy a sklady. Backend, databaze a aktualizace
bezi na nasem serveru. Zakaznik otevira aplikaci v prohlizeci.

Vhodne pro:

- male e-shopy,
- mensi sklady,
- firmy bez vlastniho IT,
- rychle piloty.

### 2. On-prem Windows server bez Dockeru

Aplikace bezi primo na pocitaci/serveru zakaznika. Backend jako Windows sluzba,
PostgreSQL jako Windows sluzba, frontend jako staticky web nebo pres backend.

Vhodne pro:

- sklady, ktere chteji data u sebe,
- provozy s horsim internetem,
- firmy, ktere chteji lokalni server.

### 3. Docker/Compose jako volitelna enterprise cesta

Docker zustane jako pripraveny zpusob nasazeni pro zakazniky, kteri ho umi
provozovat. Nebude to ale jedina cesta.

Vhodne pro:

- stredni firmy s IT spravcem,
- hosting na Linux serveru,
- automatizovane nasazeni.

## Kratky roadmap

1. Dokoncit stabilni lokalni spousteni bez Dockeru.
2. Pripravit Windows instalacni rezim: backend service, PostgreSQL service,
   konfigurace portu a jednoduchy update.
3. Pridat produkcni build frontendu a servirovani pres backend nebo reverse proxy.
4. Nechat Docker Compose jako volitelnou variantu pro technicke zakazniky.
5. Pozdeji pripravit cloudovou variantu Aardvarkland.

## Soucasne rozhodnuti

Ted je nejlepsi pokracovat cestou "bez Dockeru pro vyvoj a piloty, Docker volitelne
pro pozdejsi nasazeni". Tim se odblokuje prace hned a zaroven si nezavreme dvere
pro profesionalni provoz.
