import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';

import { bootstrapWmsApp } from './bootstrap';
import { Env } from './config';

async function main(): Promise<void> {
  const app = await bootstrapWmsApp();
  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
}

void main();
