export const INTEGRATION_STATUSES = ['ACTIVE', 'INACTIVE', 'ERROR'] as const;

export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export interface IntegrationEndpointResponse {
  id: string;
  code: string;
  name: string;
  type: string;
  baseUrl: string;
  authType: string;
  status: IntegrationStatus;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
}
