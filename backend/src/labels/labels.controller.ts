import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { Public } from '../access-control/decorators/public.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateRuntimePrintJobDto } from './dto/create-runtime-print-job.dto';
import { CreateLabelPrintJobDto } from './dto/create-label-print-job.dto';
import { CreateLabelTemplateDto } from './dto/create-label-template.dto';
import { ListLabelPrintJobsQueryDto } from './dto/list-label-print-jobs-query.dto';
import { ClaimPrintJobDto, ReportPrintJobResultDto } from './dto/print-agent-job.dto';
import { RenderLabelPreviewDto } from './dto/render-label-preview.dto';
import { ResolveScanDto } from './dto/resolve-scan.dto';
import { RuntimePrintJobActionDto } from './dto/runtime-print-job-action.dto';
import { UpsertPrintAgentDto } from './dto/upsert-print-agent.dto';
import { UpsertPrinterStationDto } from './dto/upsert-printer-station.dto';
import { LabelsService } from './labels.service';

@ApiTags('label-templates')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/label-templates')
export class LabelTemplatesController {
  constructor(private readonly labelsService: LabelsService) {}

  @RequireWarehousePermissions('label.read')
  @Get()
  findTemplates(@Param('warehouseId') warehouseId: string) {
    return this.labelsService.findTemplates(warehouseId);
  }

  @RequireWarehousePermissions('label.template.manage')
  @Post()
  createTemplate(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateLabelTemplateDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.labelsService.createTemplate(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('label.read')
  @Post(':templateReference/render-preview')
  renderPreview(
    @Param('warehouseId') warehouseId: string,
    @Param('templateReference') templateReference: string,
    @Body() dto: RenderLabelPreviewDto,
  ) {
    return this.labelsService.renderPreview(warehouseId, templateReference, dto);
  }
}

@ApiTags('label-print-jobs')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/parcels/:parcelId/labels/print-jobs')
export class ParcelLabelPrintJobsController {
  constructor(private readonly labelsService: LabelsService) {}

  @RequireWarehousePermissions('label.print')
  @Post()
  createPrintJob(
    @Param('warehouseId') warehouseId: string,
    @Param('parcelId') parcelId: string,
    @Body() dto: CreateLabelPrintJobDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.labelsService.createPrintJob(warehouseId, parcelId, dto, actor);
  }
}

@ApiTags('label-print-jobs')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/label-print-jobs')
export class LabelPrintJobsController {
  constructor(private readonly labelsService: LabelsService) {}

  @RequireWarehousePermissions('label.read')
  @Get()
  findPrintJobs(
    @Param('warehouseId') warehouseId: string,
    @Query() query: ListLabelPrintJobsQueryDto,
  ) {
    return this.labelsService.findPrintJobs(warehouseId, query);
  }
}

@ApiTags('print-stations')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/print-stations')
export class PrintStationsController {
  constructor(private readonly labelsService: LabelsService) {}

  @RequireWarehousePermissions('label.read')
  @Get()
  findPrintStations(@Param('warehouseId') warehouseId: string) {
    return this.labelsService.findPrintStationsConsole(warehouseId);
  }
}

@ApiTags('printers')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/printers')
export class PrintersController {
  constructor(private readonly labelsService: LabelsService) {}

  @RequireWarehousePermissions('label.read')
  @Get()
  findPrinters(@Param('warehouseId') warehouseId: string) {
    return this.labelsService.findPrinters(warehouseId);
  }

  @RequireWarehousePermissions('warehouse.manage')
  @Post()
  upsertPrinter(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: UpsertPrinterStationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.labelsService.upsertPrinter(warehouseId, dto, actor);
  }
}

@ApiTags('print-agents')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/print-agents')
export class PrintAgentsController {
  constructor(private readonly labelsService: LabelsService) {}

  @RequireWarehousePermissions('label.read')
  @Get()
  findAgents(@Param('warehouseId') warehouseId: string) {
    return this.labelsService.findPrintAgents(warehouseId);
  }

  @RequireWarehousePermissions('warehouse.manage')
  @Post()
  upsertAgent(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: UpsertPrintAgentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.labelsService.upsertPrintAgent(warehouseId, dto, actor);
  }
}

@ApiTags('print-jobs')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/print-jobs')
export class RuntimePrintJobsController {
  constructor(private readonly labelsService: LabelsService) {}

  @RequireWarehousePermissions('label.read')
  @Get()
  findRuntimePrintJobs(@Param('warehouseId') warehouseId: string) {
    return this.labelsService.findRuntimePrintJobs(warehouseId);
  }

  @RequireWarehousePermissions('label.print')
  @Post()
  createRuntimePrintJob(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateRuntimePrintJobDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.labelsService.createRuntimePrintJob(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('label.queue.manage')
  @Post(':jobId/retry')
  retryRuntimePrintJob(
    @Param('warehouseId') warehouseId: string,
    @Param('jobId') jobId: string,
    @Body() dto: RuntimePrintJobActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.labelsService.retryRuntimePrintJob(warehouseId, jobId, dto, actor);
  }

  @RequireWarehousePermissions('label.queue.manage')
  @Post(':jobId/cancel')
  cancelRuntimePrintJob(
    @Param('warehouseId') warehouseId: string,
    @Param('jobId') jobId: string,
    @Body() dto: RuntimePrintJobActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.labelsService.cancelRuntimePrintJob(warehouseId, jobId, dto, actor);
  }

  @RequireWarehousePermissions('label.queue.manage')
  @Post(':jobId/reassign')
  reassignRuntimePrintJob(
    @Param('warehouseId') warehouseId: string,
    @Param('jobId') jobId: string,
    @Body() dto: RuntimePrintJobActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.labelsService.reassignRuntimePrintJob(warehouseId, jobId, dto, actor);
  }

  @RequireWarehousePermissions('label.queue.manage')
  @Post(':jobId/reprint')
  reprintRuntimePrintJob(
    @Param('warehouseId') warehouseId: string,
    @Param('jobId') jobId: string,
    @Body() dto: RuntimePrintJobActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.labelsService.reprintRuntimePrintJob(warehouseId, jobId, dto, actor);
  }
}

@ApiTags('print-agent-runtime')
@Controller('warehouses/:warehouseId/print-agent/jobs')
export class PrintAgentRuntimeController {
  constructor(private readonly labelsService: LabelsService) {}

  @Public()
  @Post('claim')
  claimJobs(@Param('warehouseId') warehouseId: string, @Body() dto: ClaimPrintJobDto) {
    return this.labelsService.claimPrintJobs(warehouseId, dto);
  }

  @Public()
  @Post(':jobId/result')
  reportResult(
    @Param('warehouseId') warehouseId: string,
    @Param('jobId') jobId: string,
    @Body() dto: ReportPrintJobResultDto,
  ) {
    return this.labelsService.reportPrintJobResult(warehouseId, jobId, dto);
  }
}

@ApiTags('scanner-resolver')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/scans')
export class ScanResolverController {
  constructor(private readonly labelsService: LabelsService) {}

  @RequireWarehousePermissions('rf.read')
  @Post('resolve')
  resolveScan(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: ResolveScanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.labelsService.resolveScan(warehouseId, dto, actor);
  }
}
