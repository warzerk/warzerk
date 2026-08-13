import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MaterialsService } from './materials.service';

@UseGuards(JwtAuthGuard)
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get('search')
  search(@Query('keyword') keyword: string) {
    return this.materialsService.search(keyword ?? '');
  }

  @Get('organizations')
  listOrganizations() {
    return this.materialsService.listOrganizations();
  }
}
