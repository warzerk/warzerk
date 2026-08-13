import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BomService } from './bom.service';
import { BomQueryDto } from './dto/bom-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('bom')
export class BomController {
  constructor(private readonly bomService: BomService) {}

  @Get('first-level')
  getFirstLevel(@Query() query: BomQueryDto) {
    return this.bomService.getFirstLevelBom(query.materialCode, query.orgId);
  }
}
