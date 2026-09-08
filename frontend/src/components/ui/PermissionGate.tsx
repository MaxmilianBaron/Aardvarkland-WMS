import { PropsWithChildren, ReactNode } from 'react';
import { useWorkspace } from '../../core/workspace/workspace';
export function PermissionGate({ permission, anyOf, fallback = null, children }: PropsWithChildren<{ permission?: string; anyOf?: string[]; fallback?: ReactNode }>) {
  const { can, canAny } = useWorkspace();
  const allowed = permission ? can(permission) : anyOf ? canAny(anyOf) : true;
  return allowed ? <>{children}</> : <>{fallback}</>;
}
