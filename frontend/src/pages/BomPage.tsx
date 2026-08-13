import { Card, Descriptions, Empty, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getFirstLevelBom, type BomHeader } from '../api/bom';
import MaterialPicker from '../components/MaterialPicker';
import { useOrg } from '../context/OrgContext';

export default function BomPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const materialCode = searchParams.get('materialCode') ?? '';
  const { orgId } = useOrg();
  const [bom, setBom] = useState<BomHeader | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!materialCode) {
      setBom(null);
      return;
    }
    setLoading(true);
    getFirstLevelBom(materialCode, orgId)
      .then(setBom)
      .finally(() => {
        setLoading(false);
        setSearched(true);
      });
  }, [materialCode, orgId]);

  const handleSearch = (code: string) => {
    setSearchParams(code ? { materialCode: code } : {});
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical">
          <Typography.Text>按物料编码查询一级 BOM 清单(当前生效版本)</Typography.Text>
          <MaterialPicker value={materialCode} onSearch={handleSearch} />
        </Space>
      </Card>

      {!materialCode && <Empty description="请输入物料编码开始查询" />}

      {materialCode && (
        <Card loading={loading}>
          {!bom && searched ? (
            <Empty description="未找到该物料的 BOM 数据" />
          ) : (
            bom && (
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Descriptions title="BOM 主信息" bordered column={2} size="small">
                  <Descriptions.Item label="物料编码">{bom.materialCode}</Descriptions.Item>
                  <Descriptions.Item label="物料名称">{bom.materialName ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="版本">{bom.version ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="组织">
                    {bom.organization?.orgName ?? '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={bom.isActive ? 'green' : 'default'}>
                      {bom.isActive ? '使用中' : '未启用'}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>

                <div>
                  <Typography.Title level={5}>一级子件清单</Typography.Title>
                  <Table
                    rowKey="id"
                    dataSource={bom.lines}
                    pagination={false}
                    columns={[
                      { title: '子件编码', dataIndex: 'childCode' },
                      { title: '子件名称', dataIndex: 'childName' },
                      { title: '用量', dataIndex: 'qty' },
                      { title: '单位', dataIndex: 'unit' },
                    ]}
                  />
                </div>

                <div>
                  <Typography.Title level={5}>关联 SKU 编码</Typography.Title>
                  {bom.skus.length ? (
                    <Space wrap>
                      {bom.skus.map((sku) => (
                        <Tag key={sku.id}>{sku.skuCode}</Tag>
                      ))}
                    </Space>
                  ) : (
                    <Typography.Text type="secondary">暂无关联 SKU</Typography.Text>
                  )}
                </div>
              </Space>
            )
          )}
        </Card>
      )}
    </Space>
  );
}
