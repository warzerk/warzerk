import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(keyword: string, limit = 20) {
    return this.prisma.material.findMany({
      where: {
        OR: [
          { materialCode: { contains: keyword, mode: 'insensitive' } },
          { materialName: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { materialCode: 'asc' },
    });
  }

  async listOrganizations() {
    return this.prisma.organization.findMany({ orderBy: { orgName: 'asc' } });
  }
}
