import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import {
  ApiExceptionFilter,
  ApiResponseEnvelopeInterceptor,
  createApiVersionRewriteMiddleware,
  createRequestIdMiddleware,
  createBasicRateLimitMiddleware,
  createDistributedRateLimitMiddleware,
  createIdempotencyKeyRequiredMiddleware,
  PostgresRateLimitStore,
  buildWmsCorsOptions,
  createSecurityHeadersMiddleware,
  createStructuredRequestLogMiddleware,
} from '../common';
import { RuntimeMetricsService, createRuntimeMetricsMiddleware } from '../observability';
import { Env } from '../config';
import { PrismaService, TenantRlsInterceptor } from '../database';
import { GracefulShutdownService } from '../reliability';

export interface ConfigureWmsAppOptions {
  enableSwagger?: boolean;
}

export function configureWmsApp(
  app: INestApplication,
  options: ConfigureWmsAppOptions = {},
): INestApplication {
  const config = app.get(ConfigService<Env, true>);
  configureBodyParser(app, config.get('REQUEST_BODY_LIMIT', { infer: true }));
  const gracefulShutdown = app.get(GracefulShutdownService, { strict: false });
  app.use(gracefulShutdown.createMiddleware());
  app.use(createApiVersionRewriteMiddleware());
  app.use(createRequestIdMiddleware());
  const runtimeMetrics = app.get(RuntimeMetricsService, { strict: false });
  app.use(createRuntimeMetricsMiddleware(runtimeMetrics));
  const trustProxyHops = config.get('TRUST_PROXY_HOPS', { infer: true });
  app.use(createStructuredRequestLogMiddleware({
    enabled: config.get('STRUCTURED_LOGS_ENABLED', { infer: true }),
    service: 'wms-backend',
    version: config.get('APP_VERSION', { infer: true }),
    releaseSha: config.get('RELEASE_SHA', { infer: true }),
    environment: config.get('NODE_ENV', { infer: true }),
    trustProxyHops,
  }));
  app.use(createIdempotencyKeyRequiredMiddleware());
  configureTrustedProxy(app, trustProxyHops);
  app.use(createSecurityHeadersMiddleware({
    enableStrictTransportSecurity: config.get('SECURITY_HSTS_ENABLED', { infer: true }),
    nodeEnv: config.get('NODE_ENV', { infer: true }),
    strictTransportSecurityMaxAgeSeconds: config.get('SECURITY_HSTS_MAX_AGE_SECONDS', { infer: true }),
  }));
  app.enableCors(buildWmsCorsOptions({
    allowedOrigins: config.get('CORS_ALLOWED_ORIGINS', { infer: true }),
  }));
  const rateLimitOptions = {
    windowMs: config.get('RATE_LIMIT_WINDOW_MS', { infer: true }),
    max: config.get('RATE_LIMIT_MAX', { infer: true }),
    authLoginMax: config.get('RATE_LIMIT_AUTH_LOGIN_MAX', { infer: true }),
    authRefreshMax: config.get('RATE_LIMIT_AUTH_REFRESH_MAX', { infer: true }),
    webhookMax: config.get('RATE_LIMIT_WEBHOOK_MAX', { infer: true }),
    trustProxyHops,
    metrics: runtimeMetrics,
  };

  if (config.get('RATE_LIMIT_BACKEND', { infer: true }) === 'postgres') {
    app.use(createDistributedRateLimitMiddleware({
      ...rateLimitOptions,
      store: new PostgresRateLimitStore(app.get(PrismaService)),
      failOpen: config.get('RATE_LIMIT_FAIL_OPEN', { infer: true }),
    }));
  } else {
    app.use(createBasicRateLimitMiddleware(rateLimitOptions));
  }

  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(app.get(TenantRlsInterceptor), new ApiResponseEnvelopeInterceptor());
  app.setGlobalPrefix('api', { exclude: [{ path: '/', method: RequestMethod.GET }] });
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }));

  if (options.enableSwagger ?? config.get('ENABLE_SWAGGER', { infer: true })) {
    setupSwagger(app);
  }

  return app;
}

function configureBodyParser(app: INestApplication, limit: string): void {
  const expressApp = app as INestApplication & {
    useBodyParser?: (parser: 'json' | 'urlencoded', options: Record<string, unknown>) => INestApplication;
  };

  expressApp.useBodyParser?.('json', { limit });
  expressApp.useBodyParser?.('urlencoded', { extended: true, limit });
}

function configureTrustedProxy(app: INestApplication, trustProxyHops: number): void {
  if (trustProxyHops <= 0) {
    return;
  }

  const httpInstance = app.getHttpAdapter().getInstance() as { set?: (key: string, value: unknown) => void };
  httpInstance.set?.('trust proxy', trustProxyHops);
}

export function setupSwagger(app: INestApplication): void {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Aardvarkland API')
    .setDescription('Backend API pro Aardvarkland.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);
}
