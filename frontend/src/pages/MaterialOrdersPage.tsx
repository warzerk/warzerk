import { Card, Empty, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getOrdersByMaterial,
  type MaterialOrdersResponse,
} from '../api/orders';
import MaterialPicker from '../components/MaterialPicker';
import { useOrg } from '../context/OrgContext';

const PAGE_SIZE = 20;

export default function MaterialOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const materialCode = searchParams.get('materialCode') ?? '';
  const { orgId } = useOrg();
  const [data, setData] = useState<MaterialOrdersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!materialCode) {
      setData(null);
      return;
    }
    setLoading(true);
    getOrdersByMaterial({ materialCode, orgId, page, pageSize: PAGE_SIZE })
      .then(setData)
      .finally(() => setLoading(false));
  }, [materialCode, orgId, page]);

  const handleSearch = (code: string) => {
    setPage(1);
    setSearchParams(code ? { materialCode: code } : {});
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical">
          <Typography.Text>按物料编码查询关联的销售订单 / 采购订单 / 生产订单</Typography.Text>
          <MaterialPicker value={materialCode} onSearch={handleSearch} />
        </Space>
      </Card>

      {!materialCode && <Empty description="请输入物料编码开始查询" />}

      {materialCode && (
        <Card loading={loading}>
          <Tabs
            items={[
              {
                key: 'sales',
                label: `销售订单 (${data?.salesOrders.total ?? 0})`,
                children: (
                  <Table
                    rowKey="id"
                    dataSource={data?.salesOrders.items ?? []}
                    pagination={{
                      current: page,
                      pageSize: PAGE_SIZE,
                      total: data?.salesOrders.total ?? 0,
                      onChange: setPage,
                    }}
                    columns={[
                      { title: '订单号', dataIndex: ['salesOrder', 'orderNo'] },
                      { title: '客户', dataIndex: ['salesOrder', 'customerName'] },
                      {
                        title: '组织',
                        render: (_, row) => row.salesOrder.organization?.orgName ?? '-',
                      },
                      { title: '物料编码', dataIndex: 'materialCode' },
                      { title: '物料名称', dataIndex: 'materialName' },
                      { title: '数量', dataIndex: 'qty' },
                      { title: '单位', dataIndex: 'unit' },
                      { title: '订单日期', dataIndex: ['salesOrder', 'orderDate'] },
                      {
                        title: '状态',
                        render: (_, row) =>
                          row.salesOrder.status ? <Tag>{row.salesOrder.status}</Tag> : '-',
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'purchase',
                label: `采购订单 (${data?.purchaseOrders.total ?? 0})`,
                children: (
                  <Table
                    rowKey="id"
                    dataSource={data?.purchaseOrders.items ?? []}
                    pagination={{
                      current: page,
                      pageSize: PAGE_SIZE,
                      total: data?.purchaseOrders.total ?? 0,
                      onChange: setPage,
                    }}
                    columns={[
                      { title: '订单号', dataIndex: ['purchaseOrder', 'orderNo'] },
                      { title: '供应商', dataIndex: ['purchaseOrder', 'supplierName'] },
                      {
                        title: '组织',
                        render: (_, row) => row.purchaseOrder.organization?.orgName ?? '-',
                      },
                      { title: '物料编码', dataIndex: 'materialCode' },
                      { title: '物料名称', dataIndex: 'materialName' },
                      { title: '数量', dataIndex: 'qty' },
                      { title: '单位', dataIndex: 'unit' },
                      { title: '订单日期', dataIndex: ['purchaseOrder', 'orderDate'] },
                      {
                        title: '状态',
                        render: (_, row) =>
                          row.purchaseOrder.status ? <Tag>{row.purchaseOrder.status}</Tag> : '-',
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'production',
                label: `生产订单 (${
                  (data?.productionOrders.asProduct.total ?? 0) +
                  (data?.productionOrders.asComponent.total ?? 0)
                })`,
                children: (
                  <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    <div>
                      <Typography.Title level={5}>作为生产成品</Typography.Title>
                      <Table
                        rowKey="id"
                        dataSource={data?.productionOrders.asProduct.items ?? []}
                        pagination={{
                          current: page,
                          pageSize: PAGE_SIZE,
                          total: data?.productionOrders.asProduct.total ?? 0,
                          onChange: setPage,
                        }}
                        columns={[
                          { title: '生产订单号', dataIndex: 'orderNo' },
                          {
                            title: '组织',
                            render: (_, row) => row.organization?.orgName ?? '-',
                          },
                          { title: '计划数量', dataIndex: 'planQty' },
                          { title: '单位', dataIndex: 'unit' },
                          { title: '计划开始', dataIndex: 'planStartDate' },
                          { title: '计划完成', dataIndex: 'planEndDate' },
                          {
                            title: '状态',
                            render: (_, row) => (row.status ? <Tag>{row.status}</Tag> : '-'),
                          },
                        ]}
                      />
                    </div>
                    <div>
                      <Typography.Title level={5}>作为耗用组件</Typography.Title>
                      <Table
                        rowKey="id"
                        dataSource={data?.productionOrders.asComponent.items ?? []}
                        pagination={{
                          current: page,
                          pageSize: PAGE_SIZE,
                          total: data?.productionOrders.asComponent.total ?? 0,
                          onChange: setPage,
                        }}
                        columns={[
                          { title: '生产订单号', dataIndex: ['productionOrder', 'orderNo'] },
                          {
                            title: '成品编码',
                            dataIndex: ['productionOrder', 'materialCode'],
                          },
                          { title: '耗用物料编码', dataIndex: 'materialCode' },
                          { title: '耗用数量', dataIndex: 'qty' },
                          { title: '单位', dataIndex: 'unit' },
                        ]}
                      />
                    </div>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      )}
    </Space>
  );
}
