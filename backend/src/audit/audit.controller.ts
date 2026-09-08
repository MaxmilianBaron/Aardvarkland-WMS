import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../access-control';
import { AuditService } from './audit.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequirePermissions('audit.read')
  @Get('logs')
  listLogs(@Query() query: ListAuditLogsQueryDto) {
    return this.auditService.listLogs(query);
  }

  @RequirePermissions('audit.read')
  @Get('logs/export')
  exportLogs(@Query() query: ListAuditLogsQueryDto) {
    return this.auditService.exportLogs(query);
  }

  @RequirePermissions('audit.read')
  @Get('logs/manifest')
  getHashManifest(@Query() query: ListAuditLogsQueryDto) {
    return this.auditService.getHashManifest(query);
  }
}
