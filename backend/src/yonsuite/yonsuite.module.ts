import { Module } from '@nestjs/common';
import { YonSuiteService } from './yonsuite.service';

@Module({
  providers: [YonSuiteService],
  exports: [YonSuiteService],
})
export class YonSuiteModule {}
