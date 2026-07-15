const themeStorageKey = 'aardvarkland-demo-theme';

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(themeStorageKey);
    return stored === 'dark' || stored === 'light' ? stored : 'light';
  } catch {
    return 'light';
  }
}

const state = {
  role: 'worker',
  language: 'cs',
  theme: readStoredTheme(),
  view: 'rf',
  timelineOffset: 0,
  reserved: false,
  printedCount: 0,
  languageMenuOpen: false,
  scanValue: 'AARD1:SKU:SKU-2048',
};

const roles = ['worker', 'manager', 'admin'];
const languages = ['cs', 'en', 'ua'];
const languageLabels = { cs: 'Čeština', en: 'English', ua: 'Українська' };
const languageMenuLabels = { cs: 'Vybrat jazyk', en: 'Choose language', ua: 'Вибрати мову' };
const themeToggleLabels = {
  cs: { light: 'Přepnout na světlý režim', dark: 'Přepnout na tmavý režim' },
  en: { light: 'Switch to light mode', dark: 'Switch to dark mode' },
  ua: { light: 'Перемкнути на світлий режим', dark: 'Перемкнути на темний режим' },
};
const flagIcons = {
  cs: '<svg viewBox="0 0 640 480" focusable="false"><path fill="#fff" d="M0 0h640v240H0z"/><path fill="#d7141a" d="M0 240h640v240H0z"/><path fill="#11457e" d="M0 0l320 240L0 480z"/></svg>',
  en: '<svg viewBox="0 0 640 480" focusable="false"><path fill="#012169" d="M0 0h640v480H0z"/><path fill="#fff" d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0z"/><path fill="#c8102e" d="m424 281 216 159v40L369 281zm-184 20 6 35L54 480H0zm400-301v3L391 191l2-44L590 0zM0 0l239 176h-60L0 42z"/><path fill="#fff" d="M241 0v480h160V0zM0 160v160h640V160z"/><path fill="#c8102e" d="M273 0v480h96V0zM0 193v96h640v-96z"/></svg>',
  ua: '<svg viewBox="0 0 640 480" focusable="false"><path fill="#0057b7" d="M0 0h640v240H0z"/><path fill="#ffd700" d="M0 240h640v240H0z"/></svg>',
};
const themeIcons = {
  light: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="4"></circle><path d="M12 2.5v2"></path><path d="M12 19.5v2"></path><path d="m4.6 4.6 1.4 1.4"></path><path d="m18 18 1.4 1.4"></path><path d="M2.5 12h2"></path><path d="M19.5 12h2"></path><path d="m4.6 19.4 1.4-1.4"></path><path d="m18 6 1.4-1.4"></path></svg>',
  dark: '<svg viewBox="0 0 24 24" focusable="false"><path d="M20 14.6A7.8 7.8 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6Z"></path></svg>',
};

const icon = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const navIcons = {
  overview: icon('<path d="M4.5 11 12 5.5 19.5 11"/><path d="M6.5 10.5v8h11v-8"/><path d="M10 18.5v-4.2h4v4.2"/>'),
  products: icon('<path d="M4.8 7.2 12 3.5l7.2 3.7v9.6L12 20.5l-7.2-3.7Z"/><path d="M12 11.1 4.9 7.4"/><path d="M12 11.1v9.2"/><path d="m12 11.1 7.1-3.7"/>'),
  locations: icon('<path d="M5 5.5h14v13H5z"/><path d="M5 10h14"/><path d="M10 5.5v13"/><path d="M14.5 10v8.5"/>'),
  quality: icon('<path d="M12 3.8 18.5 7v5.2c0 4-2.7 6.7-6.5 8-3.8-1.3-6.5-4-6.5-8V7Z"/><path d="m9.2 12.4 2 2 3.8-4"/>'),
  'cycle-counts': icon('<rect x="5" y="4.5" width="14" height="15" rx="2"/><path d="M8.5 8h7"/><path d="M8.5 12h7"/><path d="m8.5 16 1.2 1.2 2.4-2.7"/>'),
  inventory: icon('<path d="M12 4.5 18.5 8 12 11.5 5.5 8 12 4.5Z"/><path d="m5.5 12.4 6.5 3.5 6.5-3.5"/><path d="m5.5 16.8 6.5 3.5 6.5-3.5"/>'),
  outbound: icon('<path d="M5 17.5h10.5a3.5 3.5 0 0 0 0-7H8"/><path d="m12.5 6.5 4 4-4 4"/><path d="M4 6.5h5"/>'),
  inbound: icon('<path d="M5 6.5h10.5a3.5 3.5 0 0 1 0 7H8"/><path d="m11.5 17.5-4-4 4-4"/><path d="M15 17.5h5"/>'),
  tasks: icon('<path d="m5 12 4 4L19 6"/><path d="M5 19h14"/><path d="M5 5h8"/>'),
  packing: icon('<path d="M5.5 7.5 12 4l6.5 3.5v9L12 20l-6.5-3.5Z"/><path d="M12 11 5.8 7.7"/><path d="M12 11v9"/><path d="m12 11 6.2-3.3"/>'),
  carriers: icon('<path d="M4.5 15.5h10.8V8H4.5z"/><path d="M15.3 11h2.8l1.4 2.3v2.2h-4.2"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/>'),
  rf: icon('<rect x="7" y="3.5" width="10" height="17" rx="2.3"/><path d="M9.5 7.5h5"/><path d="M9.5 15.5h5"/><circle cx="12" cy="18.2" r="1"/>'),
  'control-tower': icon('<circle cx="12" cy="12" r="7.5"/><path d="M12 7.5v4.5l3 2"/><path d="M4.5 12h2"/><path d="M17.5 12h2"/>'),
  reliability: icon('<path d="M12 3.8 18.5 7v5.2c0 4-2.7 6.7-6.5 8-3.8-1.3-6.5-4-6.5-8V7Z"/><path d="M8.8 12h2.2l1-2.8 2 5.6 1-2.8h2.2"/>'),
  integrations: icon('<path d="M8.5 8.5 6.8 6.8a3 3 0 0 1 4.2-4.2l2.1 2.1"/><path d="m10.8 10.8 2.4 2.4"/><path d="m15.5 15.5 1.7 1.7a3 3 0 0 1-4.2 4.2l-2.1-2.1"/><path d="M16.5 5.5h2.8v2.8"/><path d="m19.3 5.5-4.5 4.5"/>'),
  'print-stations': icon('<path d="M7.5 8V4.5h9V8"/><rect x="4" y="8" width="16" height="8.5" rx="2.2"/><path d="M7.5 14h9v5.5h-9z"/><circle cx="17.3" cy="11.4" r="1"/>'),
  settings: icon('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2-1.1L14.2 3h-4.4l-.4 2.7a7 7 0 0 0-2 1.1l-2.4-1-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2 1.1l.4 2.7h4.4l.4-2.7a7 7 0 0 0 2-1.1l2.4 1 2-3.5-2-1.5c0-.4.1-.8.1-1.2Z"/>'),
};

const viewsByRole = {
  worker: ['rf', 'tasks', 'inbound', 'packing', 'inventory', 'locations', 'print-stations'],
  manager: ['overview', 'control-tower', 'outbound', 'tasks', 'products', 'locations', 'inbound', 'inventory', 'cycle-counts', 'quality', 'packing', 'carriers', 'print-stations', 'integrations'],
  admin: ['settings', 'reliability', 'overview', 'products', 'locations', 'cycle-counts', 'quality', 'integrations', 'print-stations'],
};

const navigationSectionsByRole = {
  worker: [
    { label: 'WORK', routes: ['rf', 'tasks', 'inbound', 'packing'] },
    { label: 'SUPPORT', routes: ['inventory', 'locations', 'print-stations'] },
  ],
  manager: [
    { label: 'OPERATIONS', routes: ['overview', 'control-tower', 'outbound', 'tasks'] },
    { label: 'WAREHOUSE', routes: ['products', 'locations', 'inbound', 'inventory', 'cycle-counts', 'quality', 'packing', 'carriers'] },
    { label: 'SUPPORT', routes: ['print-stations', 'integrations'] },
  ],
  admin: [
    { label: 'SYSTEM', routes: ['settings', 'reliability', 'overview', 'products', 'locations', 'cycle-counts', 'quality'] },
    { label: 'CONNECTIONS', routes: ['integrations', 'print-stations'] },
  ],
};

const copy = {
  cs: {
    brandSubtitle: 'systém řízení skladu',
    roles: { worker: 'Skladník', manager: 'Vedoucí skladu', admin: 'Správce systému' },
    roleEyebrow: { worker: 'Skladník', manager: 'Vedoucí skladu', admin: 'Správce systému' },
    sections: {
      WORK: 'PRÁCE',
      SUPPORT: 'PODPORA',
      OPERATIONS: 'PROVOZ',
      WAREHOUSE: 'SKLAD',
      SYSTEM: 'SYSTÉM',
      CONNECTIONS: 'NAPOJENÍ',
    },
    nav: {
      overview: ['Přehled', 'provoz skladu'],
      products: ['Produkty', 'SKU · čárové kódy'],
      locations: ['Lokace', 'zaskladnění · kapacita'],
      quality: ['Kvalita', 'vratky · karanténa'],
      'cycle-counts': ['Inventury', 'počty · rozdíly'],
      inventory: ['Zásoby', 'sklad · lokace'],
      outbound: ['Objednávky', 'výdej · expedice'],
      inbound: ['Příjem', 'ASN · rampa'],
      tasks: ['Úkoly', 'vychystání · doplnění'],
      packing: ['Balení', 'balík · štítek'],
      carriers: ['Doprava', 'dopravce · sledování'],
      rf: ['Skenování', 'RF proces'],
      'control-tower': ['Provoz', 'termíny · výjimky'],
      reliability: ['Stabilita', 'kontroly · frontend'],
      integrations: ['Integrace', 'stav napojení'],
      'print-stations': ['Tiskárny', 'štítky · dotisk'],
      settings: ['Nastavení', 'účet · uživatelé'],
    },
    status: ['API připravené', '2 úlohy čekají na tisk', 'RF skenery aktivní'],
    statusStripLabel: 'Stav skladu',
    sync: 'Obnovit stav',
    advance: 'Další událost',
    reserve: 'Rezervovat',
    printNext: 'Tisknout další',
    replay: 'Opakovat',
    create: 'Nový záznam',
    approve: 'Schválit',
    headers: {
      timeline: 'Průběh směny',
      priority: 'Priorita',
      metrics: 'Stav provozu',
      scanResult: 'Výsledek',
      activeQueue: 'Aktivní fronta',
      preview: 'Náhled štítku',
      details: 'Detail',
      permissions: 'Rozdělení oprávnění',
      workContext: 'Pracovní kontext',
      deviceHealth: 'Stav zařízení',
      scannerFleet: 'Přehled skenerů',
      dockBoard: 'Rampy a vozidla',
      slaMonitor: 'Plnění termínů',
      frontendRuntime: 'Běh frontendu',
      readinessSignals: 'Provozní kontroly',
    },
    fields: {
      product: 'Produkt',
      location: 'Lokace',
      available: 'Dostupné',
      status: 'Stav',
      owner: 'Odpovědný',
      due: 'Termín',
      warehouse: 'Sklad',
      workstation: 'Pracoviště',
      code: 'Kód',
      type: 'Typ',
      source: 'Zdroj',
      target: 'Cíl',
      qty: 'Množství',
      printer: 'Tiskárna',
      user: 'Uživatel',
      role: 'Role',
      permission: 'Oprávnění',
      lastSeen: 'Naposledy',
      channel: 'Kanál',
      tracking: 'Sledování',
      variance: 'Rozdíl',
      zone: 'Zóna',
      shift: 'Směna',
      rfMode: 'RF režim',
      device: 'Zařízení',
      battery: 'Baterie',
      signal: 'Signál',
      assignedWorker: 'Pracovník',
      lastActivity: 'Aktivita',
      dock: 'Rampa',
      vehicle: 'Vozidlo',
      slot: 'Slot',
      load: 'Naloženo',
      nextAction: 'Další krok',
      event: 'Událost',
      view: 'Obrazovka',
      severity: 'Závažnost',
      note: 'Poznámka',
    },
    statuses: {
      OK: 'V pořádku',
      READY: 'Připraveno',
      ACTIVE: 'Aktivní',
      LOW: 'Nízký stav',
      HOLD: 'Pozastaveno',
      QUEUED: 'Ve frontě',
      PRINTED: 'Vytištěno',
      CONNECTED: 'Připojeno',
      RETRY: 'Opakovat',
      RESOLVED: 'Vyřešeno',
      REVIEW: 'Ke kontrole',
      PICKING: 'Vychystání',
      PACKING: 'Balení',
      WAITING: 'Čeká',
      RELEASED: 'Uvolněno',
      BLOCKED: 'Blokováno',
      DRAFT: 'Koncept',
      APPROVED: 'Schváleno',
      SYNCING: 'Synchronizace',
    },
    scanTypes: {
      SKU: 'Produkt',
      LOC: 'Lokace',
      HU: 'Manipulační jednotka',
      PARCEL: 'Balík',
      TASK: 'Úkol',
      GS1: 'GS1 kód',
      RAW: 'Neznámý kód',
    },
    scanResolved: 'Kód rozpoznán',
    scanRejected: 'Kód čeká na ruční kontrolu',
    scanSubmit: 'Vyřešit',
    scanSamples: 'Ukázkové kódy',
    actionsBadge: '4 otevřené',
    labelType: 'Balíkový štítek',
    fakeNotice: 'Ukázková data',
    empty: 'Žádné položky',
    refreshed: 'Obnoveno před 18 s',
  },
  en: {
    brandSubtitle: 'warehouse management system',
    roles: { worker: 'Worker', manager: 'Warehouse manager', admin: 'System admin' },
    roleEyebrow: { worker: 'Worker', manager: 'Warehouse manager', admin: 'System admin' },
    sections: {
      WORK: 'WORK',
      SUPPORT: 'SUPPORT',
      OPERATIONS: 'OPERATIONS',
      WAREHOUSE: 'WAREHOUSE',
      SYSTEM: 'SYSTEM',
      CONNECTIONS: 'CONNECTIONS',
    },
    nav: {
      overview: ['Overview', 'warehouse operations'],
      products: ['Products', 'SKU · barcodes'],
      locations: ['Locations', 'putaway · capacity'],
      quality: ['Quality', 'returns · quarantine'],
      'cycle-counts': ['Cycle counts', 'counts · variances'],
      inventory: ['Inventory', 'stock · locations'],
      outbound: ['Orders', 'outbound · shipping'],
      inbound: ['Receiving', 'ASN · dock'],
      tasks: ['Tasks', 'picking · replenishment'],
      packing: ['Packing', 'parcel · label'],
      carriers: ['Carriers', 'carrier · tracking'],
      rf: ['Scanning', 'RF workflow'],
      'control-tower': ['Operations', 'deadlines · exceptions'],
      reliability: ['Stability', 'readiness · frontend'],
      integrations: ['Integrations', 'connection status'],
      'print-stations': ['Printers', 'labels · reprint'],
      settings: ['Settings', 'account · users'],
    },
    status: ['API ready', '2 print jobs waiting', 'RF scanners active'],
    statusStripLabel: 'Warehouse status',
    sync: 'Refresh status',
    advance: 'Next event',
    reserve: 'Reserve',
    printNext: 'Print next',
    replay: 'Replay',
    create: 'New record',
    approve: 'Approve',
    headers: {
      timeline: 'Shift timeline',
      priority: 'Priority',
      metrics: 'Operational status',
      scanResult: 'Result',
      activeQueue: 'Active queue',
      preview: 'Label preview',
      details: 'Detail',
      permissions: 'Permission split',
      workContext: 'Work context',
      deviceHealth: 'Device health',
      scannerFleet: 'Scanner fleet',
      dockBoard: 'Docks and vehicles',
      slaMonitor: 'SLA monitor',
      frontendRuntime: 'Frontend runtime',
      readinessSignals: 'Operational checks',
    },
    fields: {
      product: 'Product',
      location: 'Location',
      available: 'Available',
      status: 'Status',
      owner: 'Owner',
      due: 'Due',
      warehouse: 'Warehouse',
      workstation: 'Workstation',
      code: 'Code',
      type: 'Type',
      source: 'Source',
      target: 'Target',
      qty: 'Quantity',
      printer: 'Printer',
      user: 'User',
      role: 'Role',
      permission: 'Permission',
      lastSeen: 'Last seen',
      channel: 'Channel',
      tracking: 'Tracking',
      variance: 'Variance',
      zone: 'Zone',
      shift: 'Shift',
      rfMode: 'RF mode',
      device: 'Device',
      battery: 'Battery',
      signal: 'Signal',
      assignedWorker: 'Assigned worker',
      lastActivity: 'Activity',
      dock: 'Dock',
      vehicle: 'Vehicle',
      slot: 'Slot',
      load: 'Loaded',
      nextAction: 'Next action',
      event: 'Event',
      view: 'View',
      severity: 'Severity',
      note: 'Note',
    },
    statuses: {
      OK: 'OK',
      READY: 'Ready',
      ACTIVE: 'Active',
      LOW: 'Low',
      HOLD: 'Hold',
      QUEUED: 'Queued',
      PRINTED: 'Printed',
      CONNECTED: 'Connected',
      RETRY: 'Retry',
      RESOLVED: 'Resolved',
      REVIEW: 'Review',
      PICKING: 'Picking',
      PACKING: 'Packing',
      WAITING: 'Waiting',
      RELEASED: 'Released',
      BLOCKED: 'Blocked',
      DRAFT: 'Draft',
      APPROVED: 'Approved',
      SYNCING: 'Syncing',
    },
    scanTypes: {
      SKU: 'Product',
      LOC: 'Location',
      HU: 'Handling unit',
      PARCEL: 'Parcel',
      TASK: 'Task',
      GS1: 'GS1 code',
      RAW: 'Unknown code',
    },
    scanResolved: 'Code resolved',
    scanRejected: 'Code waiting for manual review',
    scanSubmit: 'Resolve',
    scanSamples: 'Sample codes',
    actionsBadge: '4 open',
    labelType: 'Parcel label',
    fakeNotice: 'Sample data',
    empty: 'No items',
    refreshed: 'Refreshed 18 s ago',
  },
  ua: {
    brandSubtitle: 'система управління складом',
    roles: { worker: 'Працівник', manager: 'Керівник складу', admin: 'Адміністратор' },
    roleEyebrow: { worker: 'Працівник', manager: 'Керівник складу', admin: 'Адміністратор' },
    sections: {
      WORK: 'РОБОТА',
      SUPPORT: 'ПІДТРИМКА',
      OPERATIONS: 'ОПЕРАЦІЇ',
      WAREHOUSE: 'СКЛАД',
      SYSTEM: 'СИСТЕМА',
      CONNECTIONS: 'ПІДКЛЮЧЕННЯ',
    },
    nav: {
      overview: ['Огляд', 'робота складу'],
      products: ['Продукти', 'SKU · штрихкоди'],
      locations: ['Локації', 'розміщення · місткість'],
      quality: ['Якість', 'повернення · карантин'],
      'cycle-counts': ['Інвентаризації', 'підрахунки · розбіжності'],
      inventory: ['Запаси', 'склад · локації'],
      outbound: ['Замовлення', 'відвантаження · доставка'],
      inbound: ['Приймання', 'ASN · рампа'],
      tasks: ['Завдання', 'відбір · поповнення'],
      packing: ['Пакування', 'посилка · етикетка'],
      carriers: ['Доставка', 'перевізник · відстеження'],
      rf: ['Сканування', 'RF процес'],
      'control-tower': ['Операції', 'терміни · винятки'],
      reliability: ['Стабільність', 'перевірки · фронтенд'],
      integrations: ['Інтеграції', 'стан підключення'],
      'print-stations': ['Принтери', 'етикетки · повторний друк'],
      settings: ['Налаштування', 'акаунт · користувачі'],
    },
    status: ['API готове', '2 завдання очікують друку', 'RF сканери активні'],
    statusStripLabel: 'Стан складу',
    sync: 'Оновити стан',
    advance: 'Наступна подія',
    reserve: 'Зарезервувати',
    printNext: 'Друкувати далі',
    replay: 'Повторити',
    create: 'Новий запис',
    approve: 'Підтвердити',
    headers: {
      timeline: 'Хід зміни',
      priority: 'Пріоритет',
      metrics: 'Операційний стан',
      scanResult: 'Результат',
      activeQueue: 'Активна черга',
      preview: 'Попередній перегляд етикетки',
      details: 'Деталь',
      permissions: 'Розподіл прав',
      workContext: 'Робочий контекст',
      deviceHealth: 'Стан пристрою',
      scannerFleet: 'Парк сканерів',
      dockBoard: 'Рампи і транспорт',
      slaMonitor: 'Контроль термінів',
      frontendRuntime: 'Робота фронтенду',
      readinessSignals: 'Операційні перевірки',
    },
    fields: {
      product: 'Продукт',
      location: 'Локація',
      available: 'Доступно',
      status: 'Стан',
      owner: 'Відповідальний',
      due: 'Термін',
      warehouse: 'Склад',
      workstation: 'Станція',
      code: 'Код',
      type: 'Тип',
      source: 'Джерело',
      target: 'Ціль',
      qty: 'Кількість',
      printer: 'Принтер',
      user: 'Користувач',
      role: 'Роль',
      permission: 'Право',
      lastSeen: 'Останній раз',
      channel: 'Канал',
      tracking: 'Відстеження',
      variance: 'Різниця',
      zone: 'Зона',
      shift: 'Зміна',
      rfMode: 'RF режим',
      device: 'Пристрій',
      battery: 'Батарея',
      signal: 'Сигнал',
      assignedWorker: 'Працівник',
      lastActivity: 'Активність',
      dock: 'Рампа',
      vehicle: 'Транспорт',
      slot: 'Слот',
      load: 'Завантажено',
      nextAction: 'Наступна дія',
      event: 'Подія',
      view: 'Екран',
      severity: 'Важливість',
      note: 'Нотатка',
    },
    statuses: {
      OK: 'Готово',
      READY: 'Готово',
      ACTIVE: 'Активно',
      LOW: 'Мало',
      HOLD: 'Зупинено',
      QUEUED: 'У черзі',
      PRINTED: 'Надруковано',
      CONNECTED: 'Підключено',
      RETRY: 'Повтор',
      RESOLVED: 'Вирішено',
      REVIEW: 'На перевірку',
      PICKING: 'Відбір',
      PACKING: 'Пакування',
      WAITING: 'Очікує',
      RELEASED: 'Випущено',
      BLOCKED: 'Заблоковано',
      DRAFT: 'Чернетка',
      APPROVED: 'Підтверджено',
      SYNCING: 'Синхронізація',
    },
    scanTypes: {
      SKU: 'Продукт',
      LOC: 'Локація',
      HU: 'Одиниця обробки',
      PARCEL: 'Посилка',
      TASK: 'Завдання',
      GS1: 'GS1 код',
      RAW: 'Невідомий код',
    },
    scanResolved: 'Код розпізнано',
    scanRejected: 'Код очікує ручної перевірки',
    scanSubmit: 'Розпізнати',
    scanSamples: 'Приклади кодів',
    actionsBadge: '4 відкриті',
    labelType: 'Етикетка посилки',
    fakeNotice: 'Демо дані',
    empty: 'Немає елементів',
    refreshed: 'Оновлено 18 с тому',
  },
};

const samples = ['AARD1:SKU:SKU-2048', 'AARD1:LOC:PICK-07', 'AARD1:PARCEL:SHIP-2026-0421', 'AARD1:TASK:TASK-88', ']C101095012345678901'];

const metrics = [
  { label: { cs: 'Objednávky', en: 'Orders', ua: 'Замовлення' }, value: '186', detail: { cs: '42 připraveno k výdeji', en: '42 ready for dispatch', ua: '42 готові до відправлення' } },
  { label: { cs: 'Přesnost zásob', en: 'Stock accuracy', ua: 'Точність запасів' }, value: '99.4 %', detail: { cs: 'poslední inventura bez kritické chyby', en: 'latest count without critical variance', ua: 'останній підрахунок без критичних різниць' } },
  { label: { cs: 'Vytížení týmu', en: 'Team load', ua: 'Завантаження команди' }, value: '78 %', detail: { cs: 'vyvážené vychystání a balení', en: 'balanced picking and packing', ua: 'збалансований відбір і пакування' } },
  { label: { cs: 'Tiskové úlohy', en: 'Print jobs', ua: 'Друк' }, value: '12', detail: { cs: '2 čekají na lokální agent', en: '2 waiting for local agent', ua: '2 очікують локального агента' } },
];

const timeline = [
  { time: '08:10', title: { cs: 'ASN-204 přijato', en: 'ASN-204 received', ua: 'ASN-204 прийнято' }, detail: { cs: '12 palet na rampě 2', en: '12 pallets at dock 2', ua: '12 палет на рампі 2' }, status: 'green' },
  { time: '08:42', title: { cs: 'Wave-18 uvolněna', en: 'Wave-18 released', ua: 'Хвилю-18 випущено' }, detail: { cs: '36 objednávek pro zóny A/B', en: '36 orders for zones A/B', ua: '36 замовлень для зон A/B' }, status: 'blue' },
  { time: '09:15', title: { cs: 'PACK-02 čeká na štítky', en: 'PACK-02 waiting for labels', ua: 'PACK-02 чекає етикеток' }, detail: { cs: 'lokální agent je online', en: 'local agent is online', ua: 'локальний агент онлайн' }, status: 'amber' },
  { time: '09:34', title: { cs: 'SKU-2048 doplněno', en: 'SKU-2048 replenished', ua: 'SKU-2048 поповнено' }, detail: { cs: 'A-01-03 -> PICK-07', en: 'A-01-03 -> PICK-07', ua: 'A-01-03 -> PICK-07' }, status: 'green' },
  { time: '10:05', title: { cs: 'Vratka ke kontrole', en: 'Return under review', ua: 'Повернення на перевірці' }, detail: { cs: 'RET-772 v karanténě', en: 'RET-772 in quarantine', ua: 'RET-772 у карантині' }, status: 'red' },
];

const priorities = [
  { code: 'PACK-02', detail: { cs: 'Dotisk štítku pro SHIP-2026-0421', en: 'Reprint label for SHIP-2026-0421', ua: 'Повторний друк етикетки для SHIP-2026-0421' }, status: 'amber' },
  { code: 'PICK-07', detail: { cs: 'Doplnit SKU-2048 před další vlnou', en: 'Replenish SKU-2048 before the next wave', ua: 'Поповнити SKU-2048 перед наступною хвилею' }, status: 'green' },
  { code: 'RET-772', detail: { cs: 'Schválit výsledek kontroly kvality', en: 'Approve the quality check result', ua: 'Підтвердити результат контролю якості' }, status: 'red' },
  { code: 'ERP', detail: { cs: 'Zopakovat export skladového pohybu', en: 'Replay warehouse movement export', ua: 'Повторити експорт складського руху' }, status: 'blue' },
];

const inventoryRows = [
  { sku: 'SKU-2048', product: { cs: 'USB-C adaptér 65W', en: 'USB-C adapter 65W', ua: 'USB-C адаптер 65W' }, location: 'PICK-07', available: 148, status: 'OK' },
  { sku: 'SKU-1024', product: { cs: 'Držák ručního skeneru', en: 'Handheld scanner mount', ua: 'Кріплення ручного сканера' }, location: 'A-01-03', available: 42, status: 'LOW' },
  { sku: 'SKU-7710', product: { cs: 'Termo štítek 100x150', en: 'Thermal label 100x150', ua: 'Термоетикетка 100x150' }, location: 'PACK-02', available: 1220, status: 'OK' },
  { sku: 'SKU-8801', product: { cs: 'Modrá přepravka na vratky', en: 'Returns tote blue', ua: 'Синя тара для повернень' }, location: 'RET-01', available: 18, status: 'HOLD' },
];

const workContext = {
  warehouse: 'MAIN',
  zone: 'PICK-A',
  shift: { cs: 'Ranní', en: 'Morning', ua: 'Ранкова' },
  rfMode: { cs: 'Terminál', en: 'Terminal', ua: 'Термінал' },
};

const scannerFleetRows = [
  { code: 'RF-01', zone: 'PICK-A', mode: { cs: 'Terminál', en: 'Terminal', ua: 'Термінал' }, battery: '84 %', signal: '72 %', worker: 'SKL-104', lastActivity: '09:28', status: 'ACTIVE' },
  { code: 'RF-02', zone: 'PACK', mode: { cs: 'Telefon', en: 'Phone', ua: 'Телефон' }, battery: '46 %', signal: '68 %', worker: 'SKL-112', lastActivity: '09:25', status: 'ACTIVE' },
  { code: 'RF-03', zone: 'DOCK', mode: { cs: 'Terminál', en: 'Terminal', ua: 'Термінал' }, battery: '18 %', signal: '41 %', worker: 'SKL-118', lastActivity: '09:11', status: 'LOW' },
  { code: 'RF-04', zone: 'RET', mode: { cs: 'Stolní režim', en: 'Desktop mode', ua: 'Настільний режим' }, battery: '100 %', signal: 'LAN', worker: 'QC-02', lastActivity: '08:59', status: 'READY' },
];

const slaRows = [
  { title: { cs: 'Expedice do 14:00', en: 'Dispatch by 14:00', ua: 'Відправлення до 14:00' }, detail: { cs: '86 ze 92 objednávek má dokončené vychystání', en: '86 of 92 orders have completed picking', ua: '86 із 92 замовлень мають завершений відбір' }, status: 'ACTIVE' },
  { title: { cs: 'Balení a štítky', en: 'Packing and labels', ua: 'Пакування і етикетки' }, detail: { cs: '2 úlohy čekají na lokální tiskový agent', en: '2 jobs wait for the local print agent', ua: '2 завдання очікують локального агента друку' }, status: 'WAITING' },
  { title: { cs: 'Vratky v karanténě', en: 'Returns in quarantine', ua: 'Повернення в карантині' }, detail: { cs: 'RET-772 má vedoucí kontrolu do 10:30', en: 'RET-772 has manager review due by 10:30', ua: 'RET-772 має перевірку керівника до 10:30' }, status: 'REVIEW' },
];

const dockBoardRows = [
  { dock: { cs: 'Rampa 1', en: 'Dock 1', ua: 'Рампа 1' }, vehicle: 'PPL-174', slot: '09:30', load: '64 %', nextAction: { cs: 'Čeká na balíky PACK-02', en: 'Waiting for PACK-02 parcels', ua: 'Очікує посилки PACK-02' }, status: 'WAITING' },
  { dock: { cs: 'Rampa 2', en: 'Dock 2', ua: 'Рампа 2' }, vehicle: 'DHL-PRG', slot: '10:00', load: '41 %', nextAction: { cs: 'Nakládka probíhá', en: 'Loading in progress', ua: 'Завантаження триває' }, status: 'ACTIVE' },
  { dock: { cs: 'Rampa 3', en: 'Dock 3', ua: 'Рампа 3' }, vehicle: 'ASN-206', slot: '13:15', load: '0 %', nextAction: { cs: 'Příjem připraven', en: 'Receiving ready', ua: 'Приймання готове' }, status: 'READY' },
];

const frontendEventRows = [
  ['APP-LOAD', { cs: 'Skenování', en: 'Scanning', ua: 'Сканування' }, { cs: 'lokální sestavení · cs', en: 'local build · cs', ua: 'локальна збірка · cs' }, '09:31', 'OK'],
  ['API-FAILURE', { cs: 'Balení', en: 'Packing', ua: 'Пакування' }, { cs: '1 redigovaný detail za 24 h', en: '1 redacted detail in 24 h', ua: '1 відредагована деталь за 24 год' }, '08:55', 'REVIEW'],
  ['PWA-UPDATE', { cs: 'RF terminál', en: 'RF terminal', ua: 'RF термінал' }, { cs: 'aktualizace připravena k načtení', en: 'update ready to load', ua: 'оновлення готове до завантаження' }, '08:42', 'READY'],
];

const readinessRows = [
  { title: { cs: 'Startovací kontrola', en: 'Startup preflight', ua: 'Стартова перевірка' }, detail: { cs: 'migrace, tabulky a oprávnění ověřeny', en: 'migrations, tables, and permissions verified', ua: 'міграції, таблиці та права перевірено' }, status: 'OK' },
  { title: { cs: 'OpenAPI kontrakt', en: 'OpenAPI contract', ua: 'OpenAPI контракт' }, detail: { cs: 'frontendové endpointy sedí s exportem API', en: 'frontend endpoints match the API export', ua: 'фронтенд endpointy відповідають експорту API' }, status: 'OK' },
  { title: { cs: 'Noční gate', en: 'Nightly gate', ua: 'Нічна перевірка' }, detail: { cs: 'ověřovací běh ukládá MCP reporty jako artefakty', en: 'workflow stores MCP reports as artifacts', ua: 'перевірка зберігає MCP звіти як артефакти' }, status: 'READY' },
  { title: { cs: 'PWA prostředí', en: 'PWA shell', ua: 'PWA середовище' }, detail: { cs: 'offline prostředí a banner aktualizace připraven', en: 'offline app shell and update banner ready', ua: 'offline середовище і банер оновлення готові' }, status: 'READY' },
];

const rows = {
  tasks: [
    ['TASK-88', { cs: 'Doplnění výdejové lokace', en: 'Pick face replenishment', ua: 'Поповнення локації відбору' }, 'PICK-07', '09:45', 'PICKING'],
    ['TASK-91', { cs: 'Kontrola vratky', en: 'Return inspection', ua: 'Перевірка повернення' }, 'RET-01', '10:15', 'REVIEW'],
    ['TASK-97', { cs: 'Přesun palety do zóny B', en: 'Move pallet to zone B', ua: 'Перемістити палету в зону B' }, 'B-02-01', '10:30', 'READY'],
  ],
  inbound: [
    ['ASN-204', { cs: '12 palet elektroniky', en: '12 electronics pallets', ua: '12 палет електроніки' }, 'DOCK-02', '09:20', 'ACTIVE'],
    ['ASN-205', { cs: 'Doplnění obalového materiálu', en: 'Packaging material replenishment', ua: 'Поповнення пакувальних матеріалів' }, 'DOCK-01', '11:00', 'WAITING'],
    ['ASN-206', { cs: 'Náhradní díly', en: 'Spare parts', ua: 'Запасні частини' }, 'DOCK-03', '13:15', 'READY'],
  ],
  outbound: [
    ['ORD-4218', { cs: 'E-shop Praha', en: 'Prague e-shop', ua: 'Празький e-shop' }, 'PACK-02', 'SHIP-2026-0421', 'PACKING'],
    ['ORD-4220', { cs: 'B2B odběr', en: 'B2B pickup', ua: 'B2B самовивіз' }, 'PICK-07', 'SHIP-2026-0422', 'PICKING'],
    ['ORD-4224', { cs: 'Expresní výdej', en: 'Express dispatch', ua: 'Експрес відправлення' }, 'A-02-01', 'SHIP-2026-0424', 'RELEASED'],
  ],
  products: [
    ['SKU-2048', { cs: 'USB-C adaptér 65W', en: 'USB-C adapter 65W', ua: 'USB-C адаптер 65W' }, '8590002048012', '148', 'OK'],
    ['SKU-1024', { cs: 'Držák ručního skeneru', en: 'Handheld scanner mount', ua: 'Кріплення ручного сканера' }, '8590001024017', '42', 'LOW'],
    ['SKU-7710', { cs: 'Termo štítek 100x150', en: 'Thermal label 100x150', ua: 'Термоетикетка 100x150' }, '8590007710013', '1220', 'OK'],
  ],
  locations: [
    ['PICK-07', { cs: 'Výdejová lokace A', en: 'Pick location A', ua: 'Pick локація A' }, '78 %', 'SKU-2048', 'ACTIVE'],
    ['A-01-03', { cs: 'Regálová pozice', en: 'Rack position', ua: 'Стелажна позиція' }, '63 %', 'SKU-1024', 'ACTIVE'],
    ['RET-01', { cs: 'Karanténa vratek', en: 'Returns quarantine', ua: 'Карантин повернень' }, '41 %', 'RET-772', 'HOLD'],
  ],
  'cycle-counts': [
    ['COUNT-18', { cs: 'Zóna A', en: 'Zone A', ua: 'Зона A' }, '36', '+1', 'REVIEW'],
    ['COUNT-19', { cs: 'Výdejová lokace', en: 'Pick face', ua: 'Pick локація' }, '22', '0', 'APPROVED'],
    ['COUNT-20', { cs: 'Karanténa', en: 'Quarantine', ua: 'Карантин' }, '8', '-2', 'REVIEW'],
  ],
  quality: [
    ['RET-772', { cs: 'Poškozený obal', en: 'Damaged packaging', ua: 'Пошкоджена упаковка' }, 'RET-01', 'SKU-8801', 'REVIEW'],
    ['QC-118', { cs: 'Chybějící příslušenství', en: 'Missing accessory', ua: 'Відсутній аксесуар' }, 'RET-02', 'SKU-2048', 'HOLD'],
    ['QC-119', { cs: 'Schváleno k naskladnění', en: 'Approved for stock', ua: 'Підтверджено для складу' }, 'A-01-03', 'SKU-1024', 'APPROVED'],
  ],
  packing: [
    ['SHIP-2026-0421', { cs: 'Balík pro dopravce', en: 'Carrier parcel', ua: 'Посилка перевізнику' }, 'PACK-02', 'ZPL-100x150', 'PACKING'],
    ['SHIP-2026-0422', { cs: 'Čeká na kontrolu váhy', en: 'Waiting for weight check', ua: 'Очікує перевірки ваги' }, 'PACK-01', 'ZPL-100x150', 'WAITING'],
    ['SHIP-2026-0419', { cs: 'Štítek vytištěn', en: 'Label printed', ua: 'Етикетку надруковано' }, 'PACK-03', 'ZPL-100x150', 'PRINTED'],
  ],
  carriers: [
    ['DHL', { cs: 'Balíková přeprava', en: 'Parcel shipping', ua: 'Доставка посилок' }, 'API', 'DHL-PRG-01', 'CONNECTED'],
    ['PPL', { cs: 'Denní svoz', en: 'Daily pickup', ua: 'Щоденний забір' }, 'CSV', 'PPL-18:00', 'READY'],
    ['Zásilkovna', { cs: 'Výdejní místa', en: 'Pickup points', ua: 'Пункти видачі' }, 'API', 'ZSK-POINTS', 'SYNCING'],
  ],
  integrations: [
    ['E-shop', { cs: 'Objednávky a zásoby', en: 'Orders and stock sync', ua: 'Замовлення і запаси' }, 'REST', '2 min', 'CONNECTED'],
    [{ cs: 'API dopravců', en: 'Carrier API', ua: 'API перевізників' }, { cs: 'Štítky a sledovací čísla', en: 'Labels and tracking numbers', ua: 'Етикетки та номери відстеження' }, 'REST', '1 min', 'CONNECTED'],
    ['ERP export', { cs: 'Dávka pohybů čeká', en: 'Movement batch waiting', ua: 'Пакет рухів очікує' }, 'SFTP', '14 min', 'RETRY'],
    ['Print Agent', { cs: 'Lokální ZPL tisk', en: 'Local ZPL print path', ua: 'Локальний друк ZPL' }, 'LAN', 'online', 'CONNECTED'],
  ],
  'print-stations': [
    ['JOB-7101', { cs: 'Balíkový štítek', en: 'Parcel label', ua: 'Етикетка посилки' }, 'PACK-02', 'ZEBRA-01', 'QUEUED'],
    ['JOB-7102', { cs: 'Štítek lokace', en: 'Location label', ua: 'Етикетка локації' }, 'ADMIN-ZPL', 'ZEBRA-02', 'QUEUED'],
    ['JOB-7098', { cs: 'GS1 paletový štítek', en: 'GS1 pallet label', ua: 'GS1 етикетка палети' }, 'DOCK-02', 'ZEBRA-01', 'PRINTED'],
  ],
  settings: [
    ['usr-skladnik', { cs: 'Skladník', en: 'Worker', ua: 'Працівник' }, 'MAIN', { cs: 'RF práce', en: 'RF workflow', ua: 'RF робота' }, 'ACTIVE'],
    ['usr-vedouci', { cs: 'Vedoucí skladu', en: 'Warehouse manager', ua: 'Керівник складу' }, 'MAIN', { cs: 'Provoz a fronty', en: 'Operations and queues', ua: 'Операції та черги' }, 'ACTIVE'],
    ['usr-spravce', { cs: 'Správce systému', en: 'System admin', ua: 'Адміністратор' }, 'GLOBAL', { cs: 'Uživatelé a integrace', en: 'Users and integrations', ua: 'Користувачі та інтеграції' }, 'ACTIVE'],
  ],
};

const roleSplitRows = [
  { role: 'worker', permissions: { cs: 'RF práce, příjem, balení, zásoby a povolený tisk štítků', en: 'RF work, receiving, packing, inventory, and allowed label printing', ua: 'RF робота, приймання, пакування, запаси та дозволений друк етикеток' } },
  { role: 'manager', permissions: { cs: 'Provoz, úkoly, fronty, dotisky, kvalita a skladový stav bez API klíčů', en: 'Operations, tasks, queues, reprints, quality, and stock status without API keys', ua: 'Операції, завдання, черги, повторний друк, якість і стан запасів без API ключів' } },
  { role: 'admin', permissions: { cs: 'Uživatelé, role, sklady, integrace, tiskárny, agenti a šablony', en: 'Users, roles, warehouses, integrations, printers, agents, and templates', ua: 'Користувачі, ролі, склади, інтеграції, принтери, агенти та шаблони' } },
];

function t() {
  return copy[state.language];
}

function l(value) {
  if (value && typeof value === 'object') return value[state.language] ?? value.cs ?? '';
  return String(value ?? '');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function html(value) {
  return escapeHtml(l(value));
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function allowedViews() {
  return viewsByRole[state.role] ?? viewsByRole.worker;
}

function defaultViewForRole(role) {
  return viewsByRole[role]?.[0] ?? 'rf';
}

function navigationLabel(view) {
  return t().nav[view] ?? t().nav.overview;
}

function badgeClass(status) {
  if (['OK', 'READY', 'ACTIVE', 'CONNECTED', 'PRINTED', 'APPROVED', 'RESOLVED'].includes(status)) return 'badge--green';
  if (['LOW', 'QUEUED', 'RETRY', 'WAITING', 'SYNCING', 'REVIEW', 'DRAFT'].includes(status)) return 'badge--amber';
  if (['HOLD', 'BLOCKED'].includes(status)) return 'badge--red';
  return 'badge--blue';
}

function statusLabel(status) {
  return t().statuses[status] ?? status;
}

function renderChrome() {
  document.documentElement.lang = state.language === 'ua' ? 'uk-UA' : state.language;
  document.documentElement.dataset.theme = state.theme;
  try {
    localStorage.setItem(themeStorageKey, state.theme);
  } catch {}

  if (!allowedViews().includes(state.view)) state.view = defaultViewForRole(state.role);

  const labels = t();
  const [title, subtitle] = navigationLabel(state.view);
  setText('brand-subtitle', labels.brandSubtitle);
  setText('workspace-eyebrow', labels.roleEyebrow[state.role]);
  setText('workspace-title', title);
  setText('api-status', labels.status[0]);
  setText('print-status', labels.status[1]);
  setText('scan-status', labels.status[2]);

  const statusStrip = document.querySelector('.status-strip');
  statusStrip.setAttribute('aria-label', labels.statusStripLabel);
  statusStrip.dataset.view = state.view;

  const syncButton = document.querySelector('[data-action="sync"]');
  syncButton.setAttribute('aria-label', labels.sync);
  syncButton.setAttribute('title', labels.sync);

  const languageLabel = languageMenuLabels[state.language];
  const languageToggle = document.getElementById('language-toggle');
  const languageMenu = document.querySelector('.language-menu');
  const languageList = document.getElementById('language-list');
  document.getElementById('current-language-flag').innerHTML = flagIcons[state.language];
  languageMenu.setAttribute('aria-label', languageLabel);
  languageToggle.setAttribute('aria-label', languageLabel);
  languageToggle.setAttribute('title', languageLabel);
  languageToggle.setAttribute('aria-expanded', String(state.languageMenuOpen));
  languageList.setAttribute('aria-label', languageLabel);
  languageList.hidden = !state.languageMenuOpen;

  document.querySelectorAll('[data-flag]').forEach((iconElement) => {
    iconElement.innerHTML = flagIcons[iconElement.dataset.flag] || '';
  });

  const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
  const themeLabel = themeToggleLabels[state.language][nextTheme];
  const themeToggle = document.getElementById('theme-toggle');
  document.getElementById('theme-toggle-icon').innerHTML = themeIcons[state.theme];
  themeToggle.setAttribute('aria-label', themeLabel);
  themeToggle.setAttribute('title', themeLabel);
  themeToggle.setAttribute('aria-pressed', String(state.theme === 'dark'));

  document.querySelectorAll('[data-role]').forEach((button) => {
    const role = button.dataset.role;
    button.textContent = labels.roles[role];
    button.classList.toggle('is-active', role === state.role);
  });

  document.querySelectorAll('[data-lang]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.lang === state.language);
    button.setAttribute('aria-checked', String(button.dataset.lang === state.language));
    button.setAttribute('aria-label', languageLabels[button.dataset.lang] || button.dataset.lang);
    button.setAttribute('title', languageLabels[button.dataset.lang] || button.dataset.lang);
  });

  const nav = document.getElementById('nav-list');
  nav.innerHTML = navigationSectionsByRole[state.role].map((section) => `
    <div class="nav-section">
      <p class="nav-section-label">${escapeHtml(labels.sections[section.label])}</p>
      ${section.routes.map((view) => {
        const [label, eyebrow] = navigationLabel(view);
        return `
          <button type="button" class="nav-button${view === state.view ? ' is-active' : ''}" data-view="${view}">
            <span class="nav-icon">${navIcons[view]}</span>
            <span><strong>${escapeHtml(label)}</strong><span>${escapeHtml(eyebrow)}</span></span>
          </button>
        `;
      }).join('')}
    </div>
  `).join('');

  return { title, subtitle };
}

function renderMetrics(items = metrics) {
  return `
    <div class="metrics-grid">
      ${items.map((item) => `
        <article class="metric">
          <span>${html(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <p>${html(item.detail)}</p>
        </article>
      `).join('')}
    </div>
  `;
}

function renderTimeline() {
  const ordered = timeline.slice(state.timelineOffset).concat(timeline.slice(0, state.timelineOffset));
  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>${escapeHtml(t().headers.timeline)}</h2>
        <button class="text-button" type="button" data-action="advance">${escapeHtml(t().advance)}</button>
      </div>
      <ol class="timeline">
        ${ordered.map((item) => `
          <li>
            <time>${escapeHtml(item.time)}</time>
            <div><strong>${html(item.title)}</strong><span>${html(item.detail)}</span></div>
            <span class="color-dot color-dot--${item.status}" aria-label="${item.status}"></span>
          </li>
        `).join('')}
      </ol>
    </section>
  `;
}

function renderPriority() {
  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>${escapeHtml(t().headers.priority)}</h2>
        <span class="badge badge--amber">${escapeHtml(t().actionsBadge)}</span>
      </div>
      <div class="action-list">
        ${priorities.map((item) => `
          <article class="action-item">
            <div class="action-row">
              <strong>${escapeHtml(item.code)}</strong>
              <span class="color-dot color-dot--${item.status}" aria-label="${item.status}"></span>
            </div>
            <span class="muted">${html(item.detail)}</span>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderDataTable(columns, tableRows) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${columns.map((column) => `<th>${html(column)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${tableRows.length ? tableRows.map((row) => `
            <tr>
              ${row.map((cell, index) => {
                if (index === 0) return `<td><strong>${html(cell)}</strong></td>`;
                if (typeof cell === 'string' && t().statuses[cell]) return `<td><span class="badge ${badgeClass(cell)}">${escapeHtml(statusLabel(cell))}</span></td>`;
                return `<td>${html(cell)}</td>`;
              }).join('')}
            </tr>
          `).join('') : `<tr><td colspan="${columns.length}">${escapeHtml(t().empty)}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderContextPanel() {
  const contextItems = [
    [t().fields.warehouse, workContext.warehouse],
    [t().fields.zone, workContext.zone],
    [t().fields.shift, workContext.shift],
    [t().fields.rfMode, workContext.rfMode],
  ];
  return `
    <section class="panel context-panel">
      <div class="panel-heading">
        <h2>${escapeHtml(t().headers.workContext)}</h2>
        <span class="badge badge--green">${escapeHtml(statusLabel('ACTIVE'))}</span>
      </div>
      <div class="context-grid">
        ${contextItems.map(([label, value]) => `
          <article class="context-item">
            <span>${escapeHtml(label)}</span>
            <strong>${html(value)}</strong>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function meterValue(value) {
  const numeric = Number.parseInt(String(value).replace(/[^\d]/g, ''), 10);
  if (Number.isNaN(numeric)) return 100;
  return Math.max(0, Math.min(100, numeric));
}

function renderMeter(label, value) {
  return `
    <article class="health-item">
      <div class="health-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
      <div class="health-meter" aria-hidden="true"><span style="width: ${meterValue(value)}%"></span></div>
    </article>
  `;
}

function renderDeviceHealth(scanner = scannerFleetRows[0]) {
  return `
    <div class="device-health">
      <div class="panel-heading panel-heading--compact">
        <h2>${escapeHtml(t().headers.deviceHealth)}</h2>
        <span class="badge ${badgeClass(scanner.status)}">${escapeHtml(statusLabel(scanner.status))}</span>
      </div>
      <div class="health-grid">
        <article class="health-item">
          <div class="health-row">
            <span>${escapeHtml(t().fields.device)}</span>
            <strong>${escapeHtml(scanner.code)}</strong>
          </div>
          <span class="muted">${html(scanner.mode)} · ${escapeHtml(scanner.zone)}</span>
        </article>
        <article class="health-item">
          <div class="health-row">
            <span>${escapeHtml(t().fields.assignedWorker)}</span>
            <strong>${escapeHtml(scanner.worker)}</strong>
          </div>
          <span class="muted">${escapeHtml(t().fields.lastActivity)} ${escapeHtml(scanner.lastActivity)}</span>
        </article>
        ${renderMeter(t().fields.battery, scanner.battery)}
        ${renderMeter(t().fields.signal, scanner.signal)}
      </div>
    </div>
  `;
}

function scannerTableRows() {
  return scannerFleetRows.map((scanner) => [
    scanner.code,
    scanner.zone,
    scanner.mode,
    scanner.battery,
    scanner.signal,
    scanner.worker,
    scanner.lastActivity,
    scanner.status,
  ]);
}

function renderScannerFleetPanel() {
  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>${escapeHtml(t().headers.scannerFleet)}</h2>
        <span class="badge badge--green">${escapeHtml(statusLabel('ACTIVE'))}</span>
      </div>
      ${renderDataTable([
        t().fields.device,
        t().fields.zone,
        t().fields.rfMode,
        t().fields.battery,
        t().fields.signal,
        t().fields.assignedWorker,
        t().fields.lastActivity,
        t().fields.status,
      ], scannerTableRows())}
    </section>
  `;
}

function renderSlaPanel() {
  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>${escapeHtml(t().headers.slaMonitor)}</h2>
        <span class="badge badge--green">98.7 %</span>
      </div>
      ${renderList(slaRows)}
    </section>
  `;
}

function renderDockBoardPanel() {
  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>${escapeHtml(t().headers.dockBoard)}</h2>
        <span class="badge badge--amber">${escapeHtml(statusLabel('WAITING'))}</span>
      </div>
      <div class="dock-list">
        ${dockBoardRows.map((row) => `
          <article class="queue-item">
            <div class="queue-row">
              <strong>${html(row.dock)}</strong>
              <span class="badge ${badgeClass(row.status)}">${escapeHtml(statusLabel(row.status))}</span>
            </div>
            <div class="dock-meta">
              <span><strong>${escapeHtml(row.vehicle)}</strong><small>${escapeHtml(t().fields.vehicle)}</small></span>
              <span><strong>${escapeHtml(row.slot)}</strong><small>${escapeHtml(t().fields.slot)}</small></span>
              <span><strong>${escapeHtml(row.load)}</strong><small>${escapeHtml(t().fields.load)}</small></span>
            </div>
            <span class="muted">${html(row.nextAction)}</span>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderList(items) {
  return `
    <div class="queue-list">
      ${items.map((item) => `
        <article class="queue-item">
          <div class="queue-row">
            <strong>${html(item.title)}</strong>
            <span class="badge ${badgeClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
          </div>
          <span class="muted">${html(item.detail)}</span>
        </article>
      `).join('')}
    </div>
  `;
}

function renderLabelPreview() {
  return `
    <section class="label-preview" aria-label="${escapeHtml(t().headers.preview)}">
      <div class="label-paper">
        <div>
          <strong>Aardvarkland</strong>
          <span>${escapeHtml(t().labelType)}</span>
        </div>
        <div class="barcode-block" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="label-meta">
          <span>SHIP-2026-0421</span>
          <span>PRG-01 -> PACK-02</span>
        </div>
      </div>
    </section>
  `;
}

function renderOverview() {
  return `
    ${renderMetrics()}
    <div class="split-grid">
      ${renderTimeline()}
      ${renderPriority()}
    </div>
  `;
}

function resolveScan(raw) {
  const code = raw.trim();
  if (code.startsWith('AARD1:')) {
    const parts = code.split(':');
    return { ok: true, type: parts[1] || 'RAW', value: parts.slice(2).join(':') || code };
  }
  if (code.startsWith(']C1') || code.startsWith('01')) {
    return { ok: true, type: 'GS1', value: code.replace(']C1', '(01)') };
  }
  return { ok: false, type: 'RAW', value: code || 'EMPTY' };
}

function renderRf() {
  const result = resolveScan(state.scanValue);
  const badge = result.ok ? 'badge--green' : 'badge--red';
  const message = result.ok ? t().scanResolved : t().scanRejected;
  return `
    ${renderContextPanel()}
    <div class="rf-layout">
      <section class="scan-panel">
        <div>
          <p class="eyebrow">${escapeHtml(navigationLabel('rf')[1])}</p>
          <h2>${escapeHtml(navigationLabel('rf')[0])}</h2>
        </div>
        <form id="scan-form" class="scan-form">
          <label for="scan-input">${escapeHtml(t().fields.code)}</label>
          <div class="scan-row">
            <input id="scan-input" autocomplete="off" value="${escapeHtml(state.scanValue)}">
            <button class="primary-button" type="submit">${escapeHtml(t().scanSubmit)}</button>
          </div>
        </form>
        <div>
          <p class="eyebrow">${escapeHtml(t().scanSamples)}</p>
          <div class="scan-samples">
            ${samples.map((sample) => `<button class="sample-button" data-sample="${escapeHtml(sample)}" type="button">${escapeHtml(sample)}</button>`).join('')}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-heading">
          <h2>${escapeHtml(t().headers.scanResult)}</h2>
          <span class="badge badge--green">RF-01</span>
        </div>
        <div class="scan-result">
          <div class="scan-result-main">
            <div class="scan-meta">
              <span class="badge ${badge}">${escapeHtml(message)}</span>
              <span class="muted">${escapeHtml(t().scanTypes[result.type] || t().scanTypes.RAW)}</span>
            </div>
            <strong>${escapeHtml(result.value)}</strong>
            <span class="muted">${escapeHtml(state.scanValue)}</span>
          </div>
          <div class="scan-result-main">
            <div class="scan-meta"><span>${escapeHtml(t().fields.warehouse)}</span><strong>MAIN</strong></div>
            <div class="scan-meta"><span>${escapeHtml(t().fields.workstation)}</span><strong>RF-01</strong></div>
            <div class="scan-meta"><span>${escapeHtml(t().fields.status)}</span><strong>${escapeHtml(result.ok ? statusLabel('RESOLVED') : statusLabel('REVIEW'))}</strong></div>
          </div>
        </div>
        ${renderDeviceHealth(scannerFleetRows[0])}
      </section>
    </div>
  `;
}

function renderInventory() {
  const data = inventoryRows.map((item, index) => [
    item.sku,
    item.product,
    item.location,
    state.reserved && index === 0 ? item.available - 4 : item.available,
    item.status,
  ]);
  return `
    ${renderMetrics([
      { label: { cs: 'SKU skladem', en: 'SKUs in stock', ua: 'SKU на складі' }, value: '4 218', detail: { cs: 'napříč hlavním skladem', en: 'across the main warehouse', ua: 'у головному складі' } },
      { label: { cs: 'Rezervace', en: 'Reservations', ua: 'Резерви' }, value: state.reserved ? '94' : '90', detail: { cs: 'aktivní skladové rezervace', en: 'active stock reservations', ua: 'активні резерви запасів' } },
      { label: { cs: 'Nízký stav', en: 'Low stock', ua: 'Мало запасів' }, value: '12', detail: { cs: 'položek pod limitem', en: 'items below threshold', ua: 'позицій нижче ліміту' } },
      { label: { cs: 'Karanténa', en: 'Quarantine', ua: 'Карантин' }, value: '18', detail: { cs: 'kusů čeká na kontrolu', en: 'pieces waiting for review', ua: 'одиниць очікує перевірки' } },
    ])}
    <section class="panel">
      <div class="panel-heading">
        <h2>${escapeHtml(navigationLabel('inventory')[0])}</h2>
        <button class="text-button" type="button" data-action="reserve">${escapeHtml(t().reserve)}</button>
      </div>
      ${renderDataTable(['SKU', t().fields.product, t().fields.location, t().fields.available, t().fields.status], data)}
    </section>
  `;
}

function tablePage(view, columns, tableRows, sideItems = null, action = null) {
  const [title, subtitle] = navigationLabel(view);
  return `
    <div class="page-title-row">
      <div>
        <p class="eyebrow">${escapeHtml(subtitle)}</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
      <span class="badge badge--blue">${escapeHtml(t().fakeNotice)}</span>
    </div>
    <div class="${sideItems ? 'split-grid' : 'content-grid'}">
      <section class="panel">
        <div class="panel-heading">
          <h2>${escapeHtml(title)}</h2>
          ${action ? `<button class="text-button" type="button" data-action="${action.name}">${escapeHtml(action.label)}</button>` : ''}
        </div>
        ${renderDataTable(columns, tableRows)}
      </section>
      ${sideItems ? `<section class="panel"><div class="panel-heading"><h2>${escapeHtml(t().headers.details)}</h2></div>${renderList(sideItems)}</section>` : ''}
    </div>
  `;
}

function renderTasks() {
  const sideItems = [
    { title: { cs: 'Další úkol', en: 'Next task', ua: 'Наступне завдання' }, detail: { cs: 'TASK-88 čeká na potvrzení skenem', en: 'TASK-88 waits for scan confirmation', ua: 'TASK-88 очікує підтвердження сканом' }, status: 'PICKING' },
    { title: { cs: 'Doplnění', en: 'Replenishment', ua: 'Поповнення' }, detail: { cs: 'PICK-07 potřebuje 24 ks', en: 'PICK-07 needs 24 pcs', ua: 'PICK-07 потребує 24 шт' }, status: 'READY' },
  ];
  return tablePage('tasks', [t().fields.code, t().fields.type, t().fields.location, t().fields.due, t().fields.status], rows.tasks, sideItems);
}

function renderInbound() {
  const sideItems = [
    { title: { cs: 'Rampa 2', en: 'Dock 2', ua: 'Рампа 2' }, detail: { cs: 'ASN-204 rozpracováno', en: 'ASN-204 in progress', ua: 'ASN-204 в роботі' }, status: 'ACTIVE' },
    { title: { cs: 'Zaskladnění', en: 'Putaway', ua: 'Розміщення' }, detail: { cs: '6 palet míří do zóny A', en: '6 pallets go to zone A', ua: '6 палет ідуть до зони A' }, status: 'READY' },
  ];
  return tablePage('inbound', [t().fields.code, t().fields.type, t().fields.location, t().fields.due, t().fields.status], rows.inbound, sideItems);
}

function renderPacking() {
  return `
    <div class="split-grid">
      <section class="panel">
        <div class="panel-heading">
          <h2>${escapeHtml(navigationLabel('packing')[0])}</h2>
          <button class="text-button" type="button" data-action="print-next">${escapeHtml(t().printNext)}</button>
        </div>
        ${renderDataTable([t().fields.code, t().fields.type, t().fields.workstation, t().fields.printer, t().fields.status], rows.packing)}
      </section>
      ${renderLabelPreview()}
    </div>
  `;
}

function renderPrintStations() {
  const queueRows = rows['print-stations'].map((row, index) => {
    if (index < state.printedCount) return [row[0], row[1], row[2], row[3], 'PRINTED'];
    return row;
  });
  return `
    ${renderMetrics([
      { label: { cs: 'Aktivní skenery', en: 'Active scanners', ua: 'Активні сканери' }, value: '4', detail: { cs: 'telemetrie z pracovních zón', en: 'telemetry from work zones', ua: 'телеметрія з робочих зон' } },
      { label: { cs: 'Slabá baterie', en: 'Low battery', ua: 'Низька батарея' }, value: '1', detail: { cs: 'RF-03 potřebuje nabití', en: 'RF-03 needs charging', ua: 'RF-03 потребує заряджання' } },
      { label: { cs: 'Slabý signál', en: 'Weak signal', ua: 'Слабкий сигнал' }, value: '1', detail: { cs: 'kontrola pokrytí u ramp', en: 'coverage check near docks', ua: 'перевірка покриття біля рамп' } },
      { label: { cs: 'Tiskové úlohy', en: 'Print jobs', ua: 'Завдання друку' }, value: String(3 - state.printedCount), detail: { cs: 'fronta pro lokální agent', en: 'queue for the local agent', ua: 'черга для локального агента' } },
    ])}
    ${renderScannerFleetPanel()}
    <div class="split-grid">
      <section class="panel">
        <div class="panel-heading">
          <h2>${escapeHtml(navigationLabel('print-stations')[0])}</h2>
          <button class="text-button" type="button" data-action="print-next">${escapeHtml(t().printNext)}</button>
        </div>
        ${renderDataTable([t().fields.code, t().fields.type, t().fields.workstation, t().fields.printer, t().fields.status], queueRows)}
      </section>
      ${renderLabelPreview()}
    </div>
  `;
}

function renderControlTower() {
  return `
    ${renderMetrics([
      { label: { cs: 'SLA dnes', en: 'SLA today', ua: 'SLA сьогодні' }, value: '98.7 %', detail: { cs: 'expedice v termínu', en: 'shipments on time', ua: 'відправлення вчасно' } },
      { label: { cs: 'Výjimky', en: 'Exceptions', ua: 'Винятки' }, value: '7', detail: { cs: '3 čekají na vedoucího', en: '3 waiting for manager', ua: '3 очікують керівника' } },
      { label: { cs: 'Rampy', en: 'Docks', ua: 'Рампи' }, value: '3', detail: { cs: '1 čeká na dokončení balení', en: '1 waits for packing completion', ua: '1 очікує завершення пакування' } },
      { label: { cs: 'Vozidla', en: 'Vehicles', ua: 'Транспорт' }, value: '2', detail: { cs: 'nakládka bez blokace', en: 'loading without blockage', ua: 'завантаження без блокування' } },
    ])}
    <div class="split-grid">
      ${renderSlaPanel()}
      ${renderDockBoardPanel()}
    </div>
    <div class="split-grid">
      ${renderTimeline()}
      ${renderPriority()}
    </div>
  `;
}

function renderReliability() {
  return `
    ${renderMetrics([
      { label: { cs: 'Připravenost', en: 'Readiness', ua: 'Готовність' }, value: statusLabel('OK'), detail: { cs: 'stav služby, zpracování front a tisková fronta bez kritické chyby', en: 'health, queue worker, and print queue without critical issues', ua: 'стан сервісу, обробка черг і черга друку без критичних помилок' } },
      { label: { cs: 'Frontend chyby', en: 'Frontend errors', ua: 'Помилки фронтенду' }, value: '1', detail: { cs: 'redigovaná událost za posledních 24 h', en: 'redacted event in the last 24 h', ua: 'відредагована подія за останні 24 год' } },
      { label: { cs: 'PWA stav', en: 'PWA status', ua: 'Стан PWA' }, value: statusLabel('READY'), detail: { cs: 'instalace, offline shell a update banner', en: 'install, offline shell, and update banner', ua: 'встановлення, offline середовище і банер оновлення' } },
      { label: { cs: 'Ověření', en: 'Gate', ua: 'Перевірка' }, value: statusLabel('APPROVED'), detail: { cs: 'OpenAPI kontrakt a sestavení prošly', en: 'OpenAPI contract and build passed', ua: 'OpenAPI контракт і збірка пройшли' } },
    ])}
    <div class="split-grid">
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2>${escapeHtml(t().headers.frontendRuntime)}</h2>
            <span class="muted">${escapeHtml(t().refreshed)}</span>
          </div>
          <span class="badge badge--green">${escapeHtml(statusLabel('ACTIVE'))}</span>
        </div>
        ${renderDataTable([
          t().fields.event,
          t().fields.view,
          t().fields.note,
          t().fields.lastSeen,
          t().fields.status,
        ], frontendEventRows)}
      </section>
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2>${escapeHtml(t().headers.readinessSignals)}</h2>
            <span class="muted">${escapeHtml(t().refreshed)}</span>
          </div>
          <span class="badge badge--green">${escapeHtml(statusLabel('OK'))}</span>
        </div>
        ${renderList(readinessRows)}
      </section>
    </div>
  `;
}

function renderProducts() {
  return tablePage('products', ['SKU', t().fields.product, 'EAN', t().fields.available, t().fields.status], rows.products);
}

function renderLocations() {
  return tablePage('locations', [t().fields.location, t().fields.type, { cs: 'Kapacita', en: 'Capacity', ua: 'Місткість' }[state.language], 'SKU', t().fields.status], rows.locations);
}

function renderOutbound() {
  return tablePage('outbound', [t().fields.code, t().fields.type, t().fields.location, t().fields.tracking, t().fields.status], rows.outbound);
}

function renderCycleCounts() {
  return tablePage('cycle-counts', [t().fields.code, t().fields.location, { cs: 'Počítáno', en: 'Counted', ua: 'Пораховано' }[state.language], t().fields.variance, t().fields.status], rows['cycle-counts']);
}

function renderQuality() {
  return tablePage('quality', [t().fields.code, t().fields.type, t().fields.location, 'SKU', t().fields.status], rows.quality);
}

function renderCarriers() {
  return tablePage('carriers', [{ cs: 'Dopravce', en: 'Carrier', ua: 'Перевізник' }[state.language], t().fields.type, t().fields.channel, t().fields.tracking, t().fields.status], rows.carriers);
}

function renderIntegrations() {
  return tablePage('integrations', [t().fields.source, t().fields.type, t().fields.channel, t().fields.lastSeen, t().fields.status], rows.integrations, null, { name: 'replay', label: t().replay });
}

function renderSettings() {
  return `
    <div class="split-grid">
      <section class="panel">
        <div class="panel-heading">
          <h2>${escapeHtml(navigationLabel('settings')[0])}</h2>
          <button class="text-button" type="button">${escapeHtml(t().create)}</button>
        </div>
        ${renderDataTable([t().fields.user, t().fields.role, t().fields.warehouse, t().fields.permission, t().fields.status], rows.settings)}
      </section>
      <section class="panel">
        <div class="panel-heading">
          <h2>${escapeHtml(t().headers.permissions)}</h2>
          <span class="badge badge--green">RBAC</span>
        </div>
        <div class="permission-list">
          ${roleSplitRows.map((row) => `
            <article class="permission-item">
              <strong>${escapeHtml(t().roles[row.role])}</strong>
              <span>${html(row.permissions)}</span>
            </article>
          `).join('')}
        </div>
      </section>
    </div>
  `;
}

function renderView() {
  const root = document.getElementById('view-root');
  const renderers = {
    overview: renderOverview,
    rf: renderRf,
    inventory: renderInventory,
    tasks: renderTasks,
    inbound: renderInbound,
    packing: renderPacking,
    'print-stations': renderPrintStations,
    'control-tower': renderControlTower,
    reliability: renderReliability,
    products: renderProducts,
    locations: renderLocations,
    outbound: renderOutbound,
    'cycle-counts': renderCycleCounts,
    quality: renderQuality,
    carriers: renderCarriers,
    integrations: renderIntegrations,
    settings: renderSettings,
  };
  root.dataset.view = state.view;
  root.innerHTML = (renderers[state.view] ?? renderRf)();
}

function render() {
  renderChrome();
  renderView();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  const insideLanguageMenu = event.target.closest('.language-menu');
  if (!target) {
    if (state.languageMenuOpen && !insideLanguageMenu) {
      state.languageMenuOpen = false;
      render();
    }
    return;
  }

  if (target.dataset.action === 'language-menu-toggle') {
    state.languageMenuOpen = !state.languageMenuOpen;
    render();
    return;
  }

  if (target.dataset.action === 'theme-toggle') {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    state.languageMenuOpen = false;
    render();
    return;
  }

  if (target.dataset.role && roles.includes(target.dataset.role)) {
    state.role = target.dataset.role;
    if (!allowedViews().includes(state.view)) state.view = defaultViewForRole(state.role);
  }

  if (target.dataset.lang && languages.includes(target.dataset.lang)) {
    state.language = target.dataset.lang;
    state.languageMenuOpen = false;
  } else if (!insideLanguageMenu) {
    state.languageMenuOpen = false;
  }

  if (target.dataset.view) {
    state.view = target.dataset.view;
  }

  if (target.dataset.action === 'advance') {
    state.timelineOffset = (state.timelineOffset + 1) % timeline.length;
  }

  if (target.dataset.action === 'reserve') {
    state.reserved = !state.reserved;
  }

  if (target.dataset.action === 'print-next') {
    state.printedCount = Math.min(state.printedCount + 1, rows['print-stations'].length);
  }

  if (target.dataset.action === 'sync') {
    state.timelineOffset = 0;
    state.printedCount = 0;
    state.reserved = false;
  }

  if (target.dataset.sample) {
    state.scanValue = target.dataset.sample;
  }

  render();
});

document.addEventListener('submit', (event) => {
  if (!event.target.matches('#scan-form')) return;
  event.preventDefault();
  state.scanValue = document.getElementById('scan-input').value;
  render();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !state.languageMenuOpen) return;
  state.languageMenuOpen = false;
  render();
  document.getElementById('language-toggle').focus();
});

render();
