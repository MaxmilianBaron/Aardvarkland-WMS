import { AuthenticatedSessionContext, AuthenticatedUser } from './types';

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
  path?: string;
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
  user?: AuthenticatedUser;
  auth?: AuthenticatedSessionContext;
}
