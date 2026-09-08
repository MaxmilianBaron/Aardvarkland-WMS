export const JobRuntimeDriver = {
  NONE: 'none',
} as const;

export type JobRuntimeDriver = (typeof JobRuntimeDriver)[keyof typeof JobRuntimeDriver];

export interface RegisterJobInput {
  name: string;
  description?: string | null;
  enabled?: boolean;
  schedule?: string | null;
}

export interface RegisteredJobResponse {
  name: string;
  description: string | null;
  enabled: boolean;
  schedule: string | null;
}

export interface JobsHealthResponse {
  status: 'ok';
  runtimeDriver: JobRuntimeDriver;
  registeredJobs: number;
  enabledJobs: number;
  timestamp: string;
}
