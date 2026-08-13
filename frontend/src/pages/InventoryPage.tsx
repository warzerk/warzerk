import { Button, Card, Empty, Space, Table, Tooltip, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCurrentStock, getLedger, type LedgerEntry } from '../api/inventory';
import MaterialPicker from '../components/MaterialPicker';
import { useOrg } from '../context/OrgContext';

const PAGE_SIZE = 20;

export default function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const materialCode = searchParams.get('materialCode') ?? '';
  const { orgId } = useOrg();

  const [stock, setStock] = useState<Record<string, unknown>[]>([]);
  const [stockLoading, setStockLoading] = useState(false);

  const [ledgerItems, setLedgerItems] = useState<LedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [page, setPage] = useState(1);

  const loadStock = () => {
    if (!materialCode) return;
    setStockLoading(true);
    getCurrentStock(materialCode, orgId)
      .then(setStock)
      .finally(() => setStockLoading(false));
  };

  useEffect(loadStock, [materialCode, orgId]);

  useEffect(() => {
    if (!materialCode) {
      setLedgerItems([]);
      setLedgerTotal(0);
      return;
    }
    setLedgerLoading(true);
    getLedger({ materialCode, orgId, page, pageSize: PAGE_SIZE })
      .then((res) => {
        setLedgerItems(res.items);
        setLedgerTotal(res.total);
      })
      .finally(() => setLedgerLoading(false));
  }, [materialCode, orgId, page]);

  const handleSearch = (code: string) => {
    setPage(1);
    setSearchParams(code ? { materialCode: code } : {});
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical">
          <Typography.Text>按物料编码查询仓库现存量与库存明细账</Typography.Text>
          <MaterialPicker value={materialCode} onSearch={handleSearch} />
        </Space>
      </Card>

      {!materialCode && <Empty description="请输入物料编码开始查询" />}

      {materialCode && (
        <>
          <Card
            title="仓库现存量(实时)"
            loading={stockLoading}
            extra={
              <Tooltip title="重新查询 ERP 实时数据">
                <Button icon={<ReloadOutlined />} onClick={loadStock} />
              </Tooltip>
            }
          >
            <Table
              rowKey={(row) => JSON.stringify(row)}
              dataSource={stock}
              pagination={false}
              columns={[
                { title: '仓库编码', dataIndex: 'warehouseCode' },
                { title: '仓库名称', dataIndex: 'warehouseName' },
                { title: '现存量', dataIndex: 'qty' },
                { title: '可用量', dataIndex: 'availableQty' },
                { title: '单位', dataIndex: 'unit' },
              ]}
              locale={{ emptyText: '暂无数据 — 字段名可能需要根据实际 ERP 返回结构调整' }}
            />
          </Card>

          <Card title="库存明细账(出入库流水)" loading={ledgerLoading}>
            <Table
              rowKey="id"
              dataSource={ledgerItems}
              pagination={{
                current: page,
                pageSize: PAGE_SIZE,
                total: ledgerTotal,
                onChange: setPage,
              }}
              columns={[
                { title: '交易日期', dataIndex: 'transactionDate' },
                { title: '仓库', dataIndex: 'warehouseName' },
                { title: '方向', dataIndex: 'direction' },
                { title: '数量', dataIndex: 'qty' },
                { title: '结存数量', dataIndex: 'balanceQty' },
              ]}
              locale={{
                emptyText: '暂无数据 — 库存明细账的 ERP 接口尚待确认,该表由同步任务写入',
              }}
            />
          </Card>
        </>
      )}
    </Space>
  );
}
