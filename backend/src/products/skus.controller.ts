import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateSkuDto } from './dto/create-sku.dto';
import { ListSkusQueryDto } from './dto/list-skus-query.dto';
import { UpdateSkuDto } from './dto/update-sku.dto';
import { ProductsService } from './products.service';

@ApiTags('skus')
@ApiBearerAuth()
@Controller('skus')
export class SkusController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermissions('product.read')
  @Get()
  findMany(@Query() query: ListSkusQueryDto) {
    return this.productsService.findSkus(query);
  }

  @RequirePermissions('product.read')
  @Get(':skuId')
  findOne(@Param('skuId') skuId: string) {
    return this.productsService.findSku(skuId);
  }

  @RequirePermissions('product.manage')
  @Post()
  create(@Body() dto: CreateSkuDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.productsService.createSku(dto, actor);
  }

  @RequirePermissions('product.manage')
  @Patch(':skuId')
  update(
    @Param('skuId') skuId: string,
    @Body() dto: UpdateSkuDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productsService.updateSku(skuId, dto, actor);
  }
}
