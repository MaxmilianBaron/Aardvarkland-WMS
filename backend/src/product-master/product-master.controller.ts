import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { AttachProductClientDto } from './dto/attach-product-client.dto';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { CreateProductDocumentDto } from './dto/create-product-document.dto';
import { CreateProductUomDto } from './dto/create-product-uom.dto';
import { CreateSkuBarcodeDto } from './dto/create-sku-barcode.dto';
import { CreateUomConversionDto } from './dto/create-uom-conversion.dto';
import { LinkProductCategoryDto } from './dto/link-product-category.dto';
import { UpsertSkuPackagingLevelDto } from './dto/upsert-sku-packaging-level.dto';
import { UpsertSkuStorageRequirementDto } from './dto/upsert-sku-storage-requirement.dto';
import { ProductMasterService } from './product-master.service';

@ApiTags('product-master')
@ApiBearerAuth()
@Controller('product-master')
export class ProductMasterController {
  constructor(private readonly productMasterService: ProductMasterService) {}

  @RequirePermissions('product.read')
  @Get('categories')
  listCategories() {
    return this.productMasterService.listCategories();
  }

  @RequirePermissions('product.manage')
  @Post('categories')
  createCategory(@Body() dto: CreateProductCategoryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.productMasterService.createCategory(dto, actor);
  }

  @RequirePermissions('product.read')
  @Get('products/:productReference/categories')
  listProductCategories(@Param('productReference') productReference: string) {
    return this.productMasterService.listProductCategories(productReference);
  }

  @RequirePermissions('product.manage')
  @Post('products/:productReference/categories')
  linkProductCategory(
    @Param('productReference') productReference: string,
    @Body() dto: LinkProductCategoryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productMasterService.linkProductCategory(productReference, dto, actor);
  }

  @RequirePermissions('product.read')
  @Get('uoms')
  listUoms() {
    return this.productMasterService.listUoms();
  }

  @RequirePermissions('product.manage')
  @Post('uoms')
  createUom(@Body() dto: CreateProductUomDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.productMasterService.createUom(dto, actor);
  }

  @RequirePermissions('product.manage')
  @Post('uom-conversions')
  createUomConversion(
    @Body() dto: CreateUomConversionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productMasterService.createUomConversion(dto, actor);
  }

  @RequirePermissions('product.read')
  @Get('skus/:skuReference/barcodes')
  listSkuBarcodes(@Param('skuReference') skuReference: string) {
    return this.productMasterService.listSkuBarcodes(skuReference);
  }

  @RequirePermissions('product.manage')
  @Post('skus/:skuReference/barcodes')
  createSkuBarcode(
    @Param('skuReference') skuReference: string,
    @Body() dto: CreateSkuBarcodeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productMasterService.createSkuBarcode(skuReference, dto, actor);
  }

  @RequirePermissions('product.manage')
  @Put('skus/:skuReference/storage-requirements')
  upsertSkuStorageRequirement(
    @Param('skuReference') skuReference: string,
    @Body() dto: UpsertSkuStorageRequirementDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productMasterService.upsertStorageRequirement(skuReference, dto, actor);
  }

  @RequirePermissions('product.read')
  @Get('skus/:skuReference/packaging-levels')
  listPackagingLevels(@Param('skuReference') skuReference: string) {
    return this.productMasterService.listPackagingLevels(skuReference);
  }

  @RequirePermissions('product.manage')
  @Post('skus/:skuReference/packaging-levels')
  upsertPackagingLevel(
    @Param('skuReference') skuReference: string,
    @Body() dto: UpsertSkuPackagingLevelDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productMasterService.upsertPackagingLevel(skuReference, dto, actor);
  }

  @RequirePermissions('product.manage')
  @Post('products/:productReference/clients')
  attachProductClient(
    @Param('productReference') productReference: string,
    @Body() dto: AttachProductClientDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productMasterService.attachProductClient(productReference, dto, actor);
  }

  @RequirePermissions('product.read')
  @Get('products/:productReference/documents')
  listProductDocuments(@Param('productReference') productReference: string) {
    return this.productMasterService.listProductDocuments(productReference);
  }

  @RequirePermissions('product.manage')
  @Post('products/:productReference/documents')
  createProductDocument(
    @Param('productReference') productReference: string,
    @Body() dto: CreateProductDocumentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productMasterService.createProductDocument(productReference, dto, actor);
  }
}
