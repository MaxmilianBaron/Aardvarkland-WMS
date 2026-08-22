import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from '../app.module';
import { ConfigureWmsAppOptions, configureWmsApp } from './configure-wms-app';

export async function createWmsApp(options: ConfigureWmsAppOptions = {}): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  return configureWmsApp(app, options);
}

export async function bootstrapWmsApp(options: ConfigureWmsAppOptions = {}): Promise<INestApplication> {
  return createWmsApp(options);
}
