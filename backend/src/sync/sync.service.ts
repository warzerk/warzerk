import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { YonSuiteService } from '../yonsuite/yonsuite.service';
import {
  pick,
  pickArray,
  pickDate,
  pickNumber,
  pickString,
  toDisplayString,
} from './field-utils';

const PAGE_SIZE = 100;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly yonSuite: YonSuiteService,
    private readonly config: ConfigService,
  ) {}

  @Cron(process.env.SYNC_CRON ?? '0 0 * * * *')
  async handleScheduledSync() {
    await this.runFullSync();
  }

  async runFullSync() {
    await this.runTracked('sales_order', () => this.syncSalesOrders());
    await this.runTracked('purchase_order', () => this.syncPurchaseOrders());
    await this.runTracked('production_order', () =>
      this.syncProductionOrders(),
    );
    await this.runTracked('bom', () => this.syncBom());
  }

  private async runTracked(entity: string, fn: () => Promise<number>) {
    const log = await this.prisma.syncLog.create({ data: { entity } });
    try {
      const recordCount = await fn();
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: { finishedAt: new Date(), success: true, recordCount },
      });
      this.logger.log(`Synced ${recordCount} ${entity} record(s)`);
    } catch (error) {
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          finishedAt: new Date(),
          success: false,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      this.logger.error(`Failed syncing ${entity}: ${error}`);
    }
  }

  private async resolveOrganization(
    rawOrgId: unknown,
  ): Promise<string | undefined> {
    const yonOrgId = toDisplayString(rawOrgId);
    if (!yonOrgId) return undefined;
    const org = await this.prisma.organization.upsert({
      where: { yonOrgId },
      update: {},
      create: { yonOrgId },
    });
    return org.id;
  }

  private async resolveMaterial(
    materialCode: string | undefined,
    materialName: string | undefined,
    organizationId: string | undefined,
  ) {
    if (!materialCode) return;
    const existing = await this.prisma.material.findFirst({
      where: { materialCode, organizationId: organizationId ?? null },
    });
    if (existing) {
      if (materialName && materialName !== existing.materialName) {
        await this.prisma.material.update({
          where: { id: existing.id },
          data: { materialName },
        });
      }
      return;
    }
    await this.prisma.material.create({
      data: { materialCode, materialName, organizationId },
    });
  }

  // ---------------------------------------------------------------------
  // Sales orders
  // ---------------------------------------------------------------------

  async syncSalesOrders(): Promise<number> {
    let count = 0;
    let pageIndex = 1;

    for (;;) {
      const response = await this.yonSuite.listSalesOrders({
        pageIndex,
        pageSize: PAGE_SIZE,
      });
      const records = YonSuiteService.unwrapList(response);
      if (records.length === 0) break;

      for (const record of records) {
        const yonId = pickString(record, ['id', 'voucherId']);
        const orderNo = pickString(record, ['code', 'orderNo', 'vouchcode']);
        if (!yonId || !orderNo) continue;

        const organizationId = await this.resolveOrganization(
          pick(record, ['org', 'orgId', 'org.id']),
        );

        const salesOrder = await this.prisma.salesOrder.upsert({
          where: { yonId },
          update: {
            orderNo,
            organizationId,
            customerCode: pickString(record, ['customer.code', 'customerCode']),
            customerName: pickString(record, ['customer.name', 'customerName']),
            orderDate: pickDate(record, ['vouchdate', 'orderDate']),
            status: pickString(record, ['status', 'bstatus']),
            raw: record as object,
            syncedAt: new Date(),
          },
          create: {
            yonId,
            orderNo,
            organizationId,
            customerCode: pickString(record, ['customer.code', 'customerCode']),
            customerName: pickString(record, ['customer.name', 'customerName']),
            orderDate: pickDate(record, ['vouchdate', 'orderDate']),
            status: pickString(record, ['status', 'bstatus']),
            raw: record as object,
          },
        });

        const lines = pickArray(record, [
          'bodys',
          'body',
          'lines',
          'productList',
        ]);
        for (const line of lines) {
          const yonLineId = pickString(line, ['id']);
          const materialCode = pickString(line, [
            'material.code',
            'materialCode',
            'product.code',
            'productCode',
          ]);
          if (!yonLineId || !materialCode) continue;

          const materialName = pickString(line, [
            'material.name',
            'materialName',
            'product.name',
          ]);
          await this.resolveMaterial(
            materialCode,
            materialName,
            organizationId,
          );

          await this.prisma.salesOrderLine.upsert({
            where: { yonLineId },
            update: {
              salesOrderId: salesOrder.id,
              materialCode,
              materialName,
              qty: pickNumber(line, ['qty', 'quantity', 'nastnum']),
              unit: pickString(line, ['unit.name', 'unit']),
              deliveryDate: pickDate(line, [
                'deliveryDate',
                'planDeliveryDate',
              ]),
              raw: line as object,
            },
            create: {
              yonLineId,
              salesOrderId: salesOrder.id,
              materialCode,
              materialName,
              qty: pickNumber(line, ['qty', 'quantity', 'nastnum']),
              unit: pickString(line, ['unit.name', 'unit']),
              deliveryDate: pickDate(line, [
                'deliveryDate',
                'planDeliveryDate',
              ]),
              raw: line as object,
            },
          });
        }
        count += 1;
      }

      if (records.length < PAGE_SIZE) break;
      pageIndex += 1;
    }

    return count;
  }

  // ---------------------------------------------------------------------
  // Purchase orders
  // ---------------------------------------------------------------------

  async syncPurchaseOrders(): Promise<number> {
    let count = 0;
    let pageIndex = 1;

    for (;;) {
      const response = await this.yonSuite.listPurchaseOrders({
        pageIndex,
        pageSize: PAGE_SIZE,
      });
      const records = YonSuiteService.unwrapList(response);
      if (records.length === 0) break;

      for (const record of records) {
        const yonId = pickString(record, ['id']);
        const orderNo = pickString(record, ['code', 'orderNo']);
        if (!yonId || !orderNo) continue;

        const organizationId = await this.resolveOrganization(
          pick(record, ['org', 'orgId', 'org.id']),
        );

        const purchaseOrder = await this.prisma.purchaseOrder.upsert({
          where: { yonId },
          update: {
            orderNo,
            organizationId,
            supplierCode: pickString(record, ['vendor.code', 'supplierCode']),
            supplierName: pickString(record, ['vendor.name', 'supplierName']),
            orderDate: pickDate(record, ['vouchdate', 'orderDate']),
            status: pickString(record, ['status', 'bstatus']),
            raw: record as object,
            syncedAt: new Date(),
          },
          create: {
            yonId,
            orderNo,
            organizationId,
            supplierCode: pickString(record, ['vendor.code', 'supplierCode']),
            supplierName: pickString(record, ['vendor.name', 'supplierName']),
            orderDate: pickDate(record, ['vouchdate', 'orderDate']),
            status: pickString(record, ['status', 'bstatus']),
            raw: record as object,
          },
        });

        const lines = pickArray(record, [
          'bodys',
          'body',
          'lines',
          'productList',
        ]);
        for (const line of lines) {
          const yonLineId = pickString(line, ['id']);
          const materialCode = pickString(line, [
            'material.code',
            'materialCode',
            'product.code',
            'productCode',
          ]);
          if (!yonLineId || !materialCode) continue;

          const materialName = pickString(line, [
            'material.name',
            'materialName',
            'product.name',
          ]);
          await this.resolveMaterial(
            materialCode,
            materialName,
            organizationId,
          );

          await this.prisma.purchaseOrderLine.upsert({
            where: { yonLineId },
            update: {
              purchaseOrderId: purchaseOrder.id,
              materialCode,
              materialName,
              qty: pickNumber(line, ['qty', 'quantity']),
              unit: pickString(line, ['unit.name', 'unit']),
              deliveryDate: pickDate(line, [
                'deliveryDate',
                'planDeliveryDate',
              ]),
              raw: line as object,
            },
            create: {
              yonLineId,
              purchaseOrderId: purchaseOrder.id,
              materialCode,
              materialName,
              qty: pickNumber(line, ['qty', 'quantity']),
              unit: pickString(line, ['unit.name', 'unit']),
              deliveryDate: pickDate(line, [
                'deliveryDate',
                'planDeliveryDate',
              ]),
              raw: line as object,
            },
          });
        }
        count += 1;
      }

      if (records.length < PAGE_SIZE) break;
      pageIndex += 1;
    }

    return count;
  }

  // ---------------------------------------------------------------------
  // Production orders
  // ---------------------------------------------------------------------

  async syncProductionOrders(): Promise<number> {
    let count = 0;
    let pageIndex = 1;

    for (;;) {
      const response = await this.yonSuite.listProductionOrders({
        pageIndex,
        pageSize: PAGE_SIZE,
      });
      const records = YonSuiteService.unwrapList(response);
      if (records.length === 0) break;

      for (const record of records) {
        const yonId = pickString(record, ['id']);
        const orderNo = pickString(record, ['code', 'orderNo']);
        if (!yonId || !orderNo) continue;

        const organizationId = await this.resolveOrganization(
          pick(record, ['org', 'orgId', 'org.id']),
        );
        const materialCode = pickString(record, [
          'material.code',
          'materialCode',
          'product.code',
          'productCode',
        ]);
        const materialName = pickString(record, [
          'material.name',
          'materialName',
          'product.name',
        ]);
        await this.resolveMaterial(materialCode, materialName, organizationId);

        const productionOrder = await this.prisma.productionOrder.upsert({
          where: { yonId },
          update: {
            orderNo,
            organizationId,
            materialCode,
            materialName,
            planQty: pickNumber(record, ['planQty', 'qty']),
            unit: pickString(record, ['unit.name', 'unit']),
            planStartDate: pickDate(record, ['planStartDate', 'startDate']),
            planEndDate: pickDate(record, ['planEndDate', 'endDate']),
            status: pickString(record, ['status', 'bstatus']),
            raw: record as object,
            syncedAt: new Date(),
          },
          create: {
            yonId,
            orderNo,
            organizationId,
            materialCode,
            materialName,
            planQty: pickNumber(record, ['planQty', 'qty']),
            unit: pickString(record, ['unit.name', 'unit']),
            planStartDate: pickDate(record, ['planStartDate', 'startDate']),
            planEndDate: pickDate(record, ['planEndDate', 'endDate']),
            status: pickString(record, ['status', 'bstatus']),
            raw: record as object,
          },
        });

        const lines = pickArray(record, [
          'bodys',
          'body',
          'lines',
          'materialList',
        ]);
        for (const line of lines) {
          const yonLineId = pickString(line, ['id']);
          const lineMaterialCode = pickString(line, [
            'material.code',
            'materialCode',
            'product.code',
            'productCode',
          ]);
          if (!yonLineId || !lineMaterialCode) continue;

          const lineMaterialName = pickString(line, [
            'material.name',
            'materialName',
          ]);
          await this.resolveMaterial(
            lineMaterialCode,
            lineMaterialName,
            organizationId,
          );

          await this.prisma.productionOrderLine.upsert({
            where: { yonLineId },
            update: {
              productionOrderId: productionOrder.id,
              materialCode: lineMaterialCode,
              materialName: lineMaterialName,
              qty: pickNumber(line, ['qty', 'quantity']),
              unit: pickString(line, ['unit.name', 'unit']),
              raw: line as object,
            },
            create: {
              yonLineId,
              productionOrderId: productionOrder.id,
              materialCode: lineMaterialCode,
              materialName: lineMaterialName,
              qty: pickNumber(line, ['qty', 'quantity']),
              unit: pickString(line, ['unit.name', 'unit']),
              raw: line as object,
            },
          });
        }
        count += 1;
      }

      if (records.length < PAGE_SIZE) break;
      pageIndex += 1;
    }

    return count;
  }

  // ---------------------------------------------------------------------
  // BOM (first level only)
  // ---------------------------------------------------------------------

  async syncBom(): Promise<number> {
    let count = 0;
    let pageIndex = 1;

    for (;;) {
      const response = await this.yonSuite.listBom({
        pageIndex,
        pageSize: PAGE_SIZE,
        // Best-effort filter for "currently in use" BOMs — confirm the real
        // field name/enum value against the tenant's API docs.
        enableState: 'enable',
      });
      const records = YonSuiteService.unwrapList(response);
      if (records.length === 0) break;

      for (const record of records) {
        const yonId = pickString(record, ['id']);
        const materialCode = pickString(record, [
          'material.code',
          'materialCode',
          'parentCode',
        ]);
        if (!yonId || !materialCode) continue;

        const organizationId = await this.resolveOrganization(
          pick(record, ['org', 'orgId', 'org.id']),
        );
        const materialName = pickString(record, [
          'material.name',
          'materialName',
          'parentName',
        ]);
        await this.resolveMaterial(materialCode, materialName, organizationId);

        const bomHeader = await this.prisma.bomHeader.upsert({
          where: { yonId },
          update: {
            materialCode,
            materialName,
            version: pickString(record, ['version', 'bomVersion']),
            isActive: true,
            organizationId,
            raw: record as object,
            syncedAt: new Date(),
          },
          create: {
            yonId,
            materialCode,
            materialName,
            version: pickString(record, ['version', 'bomVersion']),
            isActive: true,
            organizationId,
            raw: record as object,
          },
        });

        // Clear and re-insert child lines/SKUs each sync — BOM structure
        // changes should fully replace the previous snapshot, not merge.
        await this.prisma.bomLine.deleteMany({
          where: { bomHeaderId: bomHeader.id },
        });
        await this.prisma.bomSku.deleteMany({
          where: { bomHeaderId: bomHeader.id },
        });

        const lines = pickArray(record, [
          'bodys',
          'body',
          'lines',
          'childList',
        ]);
        for (const line of lines) {
          const yonLineId = pickString(line, ['id']);
          const childCode = pickString(line, [
            'material.code',
            'materialCode',
            'childCode',
          ]);
          if (!yonLineId || !childCode) continue;

          await this.prisma.bomLine.create({
            data: {
              yonLineId,
              bomHeaderId: bomHeader.id,
              childCode,
              childName: pickString(line, [
                'material.name',
                'materialName',
                'childName',
              ]),
              qty: pickNumber(line, ['qty', 'quantity', 'useQty']),
              unit: pickString(line, ['unit.name', 'unit']),
              raw: line as object,
            },
          });
        }

        const skus = pickArray(record, ['skuList', 'skus']);
        for (const sku of skus) {
          const skuCode = pickString(sku, ['skuCode', 'code']);
          if (!skuCode) continue;
          await this.prisma.bomSku.create({
            data: { bomHeaderId: bomHeader.id, skuCode, raw: sku as object },
          });
        }

        count += 1;
      }

      if (records.length < PAGE_SIZE) break;
      pageIndex += 1;
    }

    return count;
  }
}
