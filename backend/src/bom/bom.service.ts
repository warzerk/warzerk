import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BomService {
  constructor(private readonly prisma: PrismaService) {}

  /** First-level BOM only: parent material's direct child lines + associated SKUs. */
  async getFirstLevelBom(materialCode: string, orgId?: string) {
    const header = await this.prisma.bomHeader.findFirst({
      where: {
        materialCode,
        isActive: true,
        ...(orgId ? { organizationId: orgId } : {}),
      },
      orderBy: { syncedAt: 'desc' },
      include: {
        lines: true,
        skus: true,
        organization: true,
      },
    });

    return header;
  }
}
