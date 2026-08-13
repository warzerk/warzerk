import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MaterialOrdersQueryDto } from './dto/material-orders-query.dto';
import { OrdersService } from './orders.service';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('by-material')
  getByMaterial(@Query() query: MaterialOrdersQueryDto) {
    return this.ordersService.getOrdersByMaterial({
      materialCode: query.materialCode,
      orgId: query.orgId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
