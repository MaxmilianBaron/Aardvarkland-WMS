import { BeforeApplicationShutdown, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Env } from '../config';

type RequestLike = { originalUrl?: string; url?: string; method?: string };
type ResponseLike = {
  status(code: number): { json(body: unknown): void };
  on(event: 'finish' | 'close', listener: () => void): void;
};
type NextFunction = () => void;

@Injectable()
export class GracefulShutdownService implements BeforeApplicationShutdown, OnApplicationShutdown {
  private draining = false;
  private activeRequests = 0;

  constructor(private readonly config: ConfigService<Env, true>) {}

  createMiddleware() {
    return (request: RequestLike, response: ResponseLike, next: NextFunction) => {
      if (this.draining && !isHealthRequest(request)) {
        response.status(503).json({
          error: {
            code: 'SERVER_DRAINING',
            message: 'Server is shutting down and is not accepting new requests.',
            statusCode: 503,
          },
        });
        return;
      }

      this.activeRequests += 1;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.activeRequests = Math.max(0, this.activeRequests - 1);
      };

      response.on('finish', release);
      response.on('close', release);
      next();
    };
  }

  beforeApplicationShutdown(): void {
    this.draining = true;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.waitForInFlightRequests();
  }

  getSnapshot() {
    return {
      draining: this.draining,
      activeRequests: this.activeRequests,
      timeoutMs: this.config.get('GRACEFUL_SHUTDOWN_TIMEOUT_MS', { infer: true }),
    };
  }

  private async waitForInFlightRequests(): Promise<void> {
    const timeoutMs = this.config.get('GRACEFUL_SHUTDOWN_TIMEOUT_MS', { infer: true });
    const deadline = Date.now() + timeoutMs;

    while (this.activeRequests > 0 && Date.now() < deadline) {
      await delay(50);
    }
  }
}

function isHealthRequest(request: RequestLike): boolean {
  const path = request.originalUrl ?? request.url ?? '';
  return path.startsWith('/api/health') || path.startsWith('/health');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
