import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { YonSuiteService } from '../yonsuite/yonsuite.service';

interface CacheEntry {
  expiresAt: number;
  data: unknown;
}

const CURRENT_STOCK_CACHE_TTL_MS = 30_000;

@Injectable()
export class InventoryService {
  private readonly currentStockCache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly yonSuite: YonSuiteService,
  ) {}

  /**
   * Current stock is queried live against YonSuite (never synced to
   * Postgres) since 现存量 needs to be accurate in near-real time. A short
   * TTL cache just protects against a user hammering refresh.
   */
  async getCurrentStock(materialCode: string, orgId?: string) {
    const cacheKey = `${materialCode}::${orgId ?? ''}`;
    const cached = this.currentStockCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const response = await this.yonSuite.queryCurrentStocks({
      materialCode,
      ...(orgId ? { org: orgId } : {}),
      pageIndex: 1,
      pageSize: 200,
    });
    const records = YonSuiteService.unwrapList(response);

    this.currentStockCache.set(cacheKey, {
      data: records,
      expiresAt: Date.now() + CURRENT_STOCK_CACHE_TTL_MS,
    });

    return records;
  }

  async getLedger(params: {
    materialCode: string;
    warehouseCode?: string;
    organizationId?: string;
    page: number;
    pageSize: number;
  }) {
    const { materialCode, warehouseCode, organizationId, page, pageSize } =
      params;

    const where = {
      materialCode,
      ...(warehouseCode ? { warehouseCode } : {}),
      ...(organizationId ? { organizationId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.inventoryLedgerEntry.findMany({
        where,
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventoryLedgerEntry.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }
}
