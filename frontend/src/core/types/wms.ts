export type Severity = 'good' | 'warning' | 'critical' | 'neutral';

export interface Metric {
  label: string;
  value: string;
  change: string;
  severity: Severity;
}

export interface Shipment {
  id: string;
  supplier: string;
  dock: string;
  status: 'Plánováno' | 'Na rampě' | 'Přijímá se' | 'Dokončeno';
  eta: string;
  lines: number;
  progress: number;
}

export interface StockQuant {
  id: string;
  sku: string;
  product: string;
  location: string;
  lot: string;
  available: number;
  reserved: number;
  status: 'Available' | 'Reserved' | 'Blocked' | 'Quarantine';
  client: string;
}

export interface Order {
  id: string;
  channel: string;
  priority: 'Low' | 'Normal' | 'High' | 'Rush';
  status: 'New' | 'Allocated' | 'Picking' | 'Packed' | 'Shipped';
  lines: number;
  wave: string;
  cutoff: string;
}

export interface WarehouseTask {
  id: string;
  type: 'Pick' | 'Putaway' | 'Move' | 'Replenishment' | 'Cycle count';
  assignee: string;
  from: string;
  to: string;
  status: 'Open' | 'Claimed' | 'In progress' | 'Exception' | 'Done';
  priority: number;
  quantity: number;
  sku: string;
}

export interface NextBestAction {
  id: string;
  title: string;
  detail: string;
  severity: Severity;
  impact: string;
  cta: string;
  route: string;
}

export interface ZoneLoad {
  id: string;
  label: string;
  role: string;
  backlog: number;
  workers: number;
  utilization: number;
  risk: Severity;
}

export interface LiveEvent {
  id: string;
  title: string;
  detail: string;
  actor: string;
  severity: Severity;
  time: string;
}

export interface WavePlan {
  id: string;
  status: 'Draft' | 'Ready' | 'Running' | 'Completed' | 'At risk';
  cutoff: string;
  orders: number;
  lines: number;
  pickZones: string[];
  progress: number;
  risk: Severity;
  recommendation: string;
}

export interface PackingLine {
  orderId: string;
  sku: string;
  product: string;
  expected: number;
  scanned: number;
  serialRequired: boolean;
}

export interface WorkerLoad {
  id: string;
  name: string;
  role: 'Picker' | 'Packer' | 'Receiver' | 'Supervisor';
  zone: string;
  utilization: number;
  activeTask: string;
}
