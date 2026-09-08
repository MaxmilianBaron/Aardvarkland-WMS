import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ConfigurationRulesController } from './configuration-rules.controller';
import { ConfigurationRulesService } from './configuration-rules.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ConfigurationRulesController],
  providers: [ConfigurationRulesService],
  exports: [ConfigurationRulesService],
})
export class ConfigurationRulesModule {}
