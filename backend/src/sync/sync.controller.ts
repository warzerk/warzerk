import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SyncService } from './sync.service';

@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /** Manual trigger, useful while verifying the YonSuite field mappings. */
  @Post('run')
  async run() {
    await this.syncService.runFullSync();
    return { started: true };
  }
}
