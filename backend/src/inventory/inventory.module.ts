import { Module } from '@nestjs/common';
import { YonSuiteModule } from '../yonsuite/yonsuite.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [YonSuiteModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
