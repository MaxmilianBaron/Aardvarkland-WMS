import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateSkuDto } from './dto/create-sku.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ListSkusQueryDto } from './dto/list-skus-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateSkuDto } from './dto/update-sku.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermissions('product.read')
  @Get()
  findMany(@Query() query: ListProductsQueryDto) {
    return this.productsService.findProducts(query);
  }

  @RequirePermissions('product.read')
  @Get('skus')
  findSkus(@Query() query: ListSkusQueryDto) {
    return this.productsService.findSkus(query);
  }

  @RequirePermissions('product.read')
  @Get('skus/:skuId')
  findSku(@Param('skuId') skuId: string) {
    return this.productsService.findSku(skuId);
  }

  @RequirePermissions('product.manage')
  @Post('skus')
  createSku(@Body() dto: CreateSkuDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.productsService.createSku(dto, actor);
  }

  @RequirePermissions('product.manage')
  @Patch('skus/:skuId')
  updateSku(
    @Param('skuId') skuId: string,
    @Body() dto: UpdateSkuDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productsService.updateSku(skuId, dto, actor);
  }

  @RequirePermissions('product.read')
  @Get(':productId')
  findOne(@Param('productId') productId: string) {
    return this.productsService.findProduct(productId);
  }

  @RequirePermissions('product.manage')
  @Post()
  create(@Body() dto: CreateProductDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.productsService.createProduct(dto, actor);
  }

  @RequirePermissions('product.manage')
  @Patch(':productId')
  update(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productsService.updateProduct(productId, dto, actor);
  }
}
