import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface MaterialQueryParams {
  materialCode: string;
  orgId?: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async getSalesOrdersByMaterial({
    materialCode,
    orgId,
    page,
    pageSize,
  }: MaterialQueryParams) {
    const where = {
      materialCode,
      ...(orgId ? { salesOrder: { organizationId: orgId } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.salesOrderLine.findMany({
        where,
        include: { salesOrder: { include: { organization: true } } },
        orderBy: { salesOrder: { orderDate: 'desc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.salesOrderLine.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getPurchaseOrdersByMaterial({
    materialCode,
    orgId,
    page,
    pageSize,
  }: MaterialQueryParams) {
    const where = {
      materialCode,
      ...(orgId ? { purchaseOrder: { organizationId: orgId } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.purchaseOrderLine.findMany({
        where,
        include: { purchaseOrder: { include: { organization: true } } },
        orderBy: { purchaseOrder: { orderDate: 'desc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.purchaseOrderLine.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * Production orders relate to a material two ways: the order's main
   * product (header.materialCode) or a consumed component (line.materialCode).
   * We return both, tagged, since "该物料相关的生产订单" plausibly means either.
   */
  async getProductionOrdersByMaterial({
    materialCode,
    orgId,
    page,
    pageSize,
  }: MaterialQueryParams) {
    const headerWhere = {
      materialCode,
      ...(orgId ? { organizationId: orgId } : {}),
    };
    const lineWhere = {
      materialCode,
      ...(orgId ? { productionOrder: { organizationId: orgId } } : {}),
    };

    const [asProduct, asProductTotal, asComponent, asComponentTotal] =
      await Promise.all([
        this.prisma.productionOrder.findMany({
          where: headerWhere,
          include: { organization: true },
          orderBy: { planStartDate: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.productionOrder.count({ where: headerWhere }),
        this.prisma.productionOrderLine.findMany({
          where: lineWhere,
          include: { productionOrder: { include: { organization: true } } },
          orderBy: { productionOrder: { planStartDate: 'desc' } },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.productionOrderLine.count({ where: lineWhere }),
      ]);

    return {
      asProduct: { items: asProduct, total: asProductTotal, page, pageSize },
      asComponent: {
        items: asComponent,
        total: asComponentTotal,
        page,
        pageSize,
      },
    };
  }

  async getOrdersByMaterial(params: MaterialQueryParams) {
    const [salesOrders, purchaseOrders, productionOrders] = await Promise.all([
      this.getSalesOrdersByMaterial(params),
      this.getPurchaseOrdersByMaterial(params),
      this.getProductionOrdersByMaterial(params),
    ]);

    return { salesOrders, purchaseOrders, productionOrders };
  }
}
