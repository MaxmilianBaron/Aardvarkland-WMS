import { AnalyticsWarehouseScope } from '../analytics';

export interface DecisionSupportEngineMetadata {
  externalCalls: false;
  mode: 'local-rule-based';
  version: string;
}

export interface OpsSummaryResponse {
  generatedAt: Date;
  warehouse: AnalyticsWarehouseScope;
  engine: DecisionSupportEngineMetadata;
  summary: string;
  metrics: {
    activeLocations: number;
    exceptionRatio: number;
    openExceptions: number | null;
    parcelsTotal: number;
    parcelsUpdatedInWindow: number;
  };
  signals: string[];
  risks: string[];
  recommendedActions: string[];
}

export interface ExceptionTriageRecommendation {
  exceptionId: string;
  category: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  recommendedAction: string;
  severity: string;
  signals: string[];
  summary: string;
}

export interface ExceptionTriageResponse {
  generatedAt: Date;
  warehouse: AnalyticsWarehouseScope;
  engine: DecisionSupportEngineMetadata;
  source: {
    available: boolean;
    scanned: number;
  };
  recommendations: ExceptionTriageRecommendation[];
}
