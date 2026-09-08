export interface StatusCount {
  key: string;
  count: number;
}

export interface ControlTowerRisk {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  metric: number;
  metadata?: Record<string, unknown>;
}

export interface ControlTowerOverviewResponse {
  warehouseId: string;
  generatedAt: string;
  windows: {
    cutoffWindowHours: number;
    staleTaskMinutes: number;
  };
  backlog: {
    openTasks: number;
    staleTasks: number;
    tasksByStatus: StatusCount[];
    tasksByType: StatusCount[];
  };
  outbound: {
    ordersByStatus: StatusCount[];
    cutoffRiskOrders: number;
    exceptionOrders: number;
  };
  waves: {
    wavesByStatus: StatusCount[];
    activeWaves: number;
    unreleasedWaves: number;
  };
  shipping: {
    shipmentsByStatus: StatusCount[];
    carrierExceptions: number;
  };
  exceptions: {
    openExceptions: number;
    criticalOpenExceptions: number;
    exceptionsBySeverity: StatusCount[];
  };
  slotting: {
    openRecommendations: number;
  };
  dockBoard: {
    doors: Array<{
      id: string;
      code: string;
      status: string;
      doorType: string;
      zone: string | null;
      activeAppointmentNumber: string | null;
      activeTrailerNumber: string | null;
    }>;
    scheduledAppointments: number;
    waitingTrailers: number;
    dwellRiskTrailers: number;
    unavailableDoors: number;
  };
  slaMonitor: {
    dueSoonOrders: number;
    overdueOrders: number;
    staleTasks: number;
    carrierExceptions: number;
    status: 'OK' | 'WARNING' | 'CRITICAL';
  };
  risks: ControlTowerRisk[];
}
