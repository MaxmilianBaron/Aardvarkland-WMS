import { SetMetadata } from '@nestjs/common';

import { PUBLIC_ROUTE_KEY } from '../access-control.constants';

export const Public = () => SetMetadata(PUBLIC_ROUTE_KEY, true);
