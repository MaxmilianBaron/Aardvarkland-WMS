import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ListReservationsQueryDto } from './dto/list-reservations-query.dto';
import { ReleaseReservationDto } from './dto/release-reservation.dto';
import { ReservationsService } from './reservations.service';
import { ReservationResponse } from './reservations.types';

@ApiTags('reservations')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @RequireWarehousePermissions('reservation.read')
  @Get()
  @ApiOperation({ summary: 'List warehouse reservations' })
  @ApiOkResponse({ type: [ReservationResponse] })
  findMany(
    @Param('warehouseId') warehouseId: string,
    @Query() query: ListReservationsQueryDto,
  ): Promise<ReservationResponse[]> {
    return this.reservationsService.findMany(warehouseId, query);
  }

  @RequireWarehousePermissions('reservation.read')
  @Get(':reservationId')
  @ApiOperation({ summary: 'Get a reservation' })
  @ApiOkResponse({ type: ReservationResponse })
  findOne(
    @Param('warehouseId') warehouseId: string,
    @Param('reservationId') reservationId: string,
  ): Promise<ReservationResponse> {
    return this.reservationsService.findOne(warehouseId, reservationId);
  }

  @RequireWarehousePermissions('reservation.manage')
  @Post()
  @ApiOperation({ summary: 'Create a manual reservation' })
  @ApiCreatedResponse({ type: ReservationResponse })
  create(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateReservationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReservationResponse> {
    return this.reservationsService.create(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('reservation.manage')
  @Post(':reservationId/release')
  @ApiOperation({ summary: 'Release an active reservation' })
  @ApiOkResponse({ type: ReservationResponse })
  release(
    @Param('warehouseId') warehouseId: string,
    @Param('reservationId') reservationId: string,
    @Body() dto: ReleaseReservationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReservationResponse> {
    return this.reservationsService.release(warehouseId, reservationId, dto, actor);
  }

  @RequireWarehousePermissions('reservation.manage')
  @Post(':reservationId/cancel')
  @ApiOperation({ summary: 'Cancel an active reservation' })
  @ApiOkResponse({ type: ReservationResponse })
  cancel(
    @Param('warehouseId') warehouseId: string,
    @Param('reservationId') reservationId: string,
    @Body() dto: ReleaseReservationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReservationResponse> {
    return this.reservationsService.cancel(warehouseId, reservationId, dto, actor);
  }
}
