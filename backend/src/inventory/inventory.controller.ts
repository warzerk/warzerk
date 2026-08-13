import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStockQueryDto } from './dto/current-stock-query.dto';
import { LedgerQueryDto } from './dto/ledger-query.dto';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('current-stock')
  getCurrentStock(@Query() query: CurrentStockQueryDto) {
    return this.inventoryService.getCurrentStock(
      query.materialCode,
      query.orgId,
    );
  }

  @Get('ledger')
  getLedger(@Query() query: LedgerQueryDto) {
    return this.inventoryService.getLedger({
      materialCode: query.materialCode,
      warehouseCode: query.warehouseCode,
      organizationId: query.orgId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
