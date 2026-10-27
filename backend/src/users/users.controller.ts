import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermissions('user.read')
  @Get()
  findMany(@CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.findMany(actor);
  }

  @RequirePermissions('user.read')
  @Get(':userId')
  findById(@Param('userId') userId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.findById(userId, actor);
  }

  @RequireWarehousePermissions('user.manage')
  @Post()
  createUser(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.createUser(dto, actor);
  }

  @RequireWarehousePermissions('user.manage')
  @Post(':userId/roles')
  assignRoleToUser(
    @Param('userId') userId: string,
    @Body() dto: AssignUserRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.assignRoleToUser(userId, dto, actor);
  }
}
