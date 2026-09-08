import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Public } from './access-control/decorators/public.decorator';
import { getHomePageHtml } from './app-home.page';
import { Env } from './config';

@Public()
@Controller()
export class AppController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getRoot() {
    return getHomePageHtml({
      enableConsole: false,
      enableSwagger: this.config.get('ENABLE_SWAGGER', { infer: true }),
    });
  }
}
