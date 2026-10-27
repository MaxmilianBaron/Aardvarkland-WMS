import { SetMetadata } from '@nestjs/common';

import { REQUIRED_WAREHOUSE_PERMISSIONS_KEY } from '../access-control.constants';

export const RequireWarehousePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_WAREHOUSE_PERMISSIONS_KEY, permissions);
