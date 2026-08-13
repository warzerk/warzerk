import { Module } from '@nestjs/common';
import { YonSuiteModule } from '../yonsuite/yonsuite.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [YonSuiteModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
