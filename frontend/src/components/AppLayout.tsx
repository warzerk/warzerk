import { Layout, Menu, Select, Space, Typography, Button } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { OrgProvider, useOrg } from '../context/OrgContext';

const { Header, Content } = Layout;

const NAV_ITEMS = [
  { key: '/orders', label: '订单联查' },
  { key: '/inventory', label: '库存查询' },
  { key: '/bom', label: 'BOM查询' },
];

function OrgSelect() {
  const { organizations, orgId, setOrgId } = useOrg();
  return (
    <Select
      allowClear
      placeholder="全部组织"
      style={{ width: 200 }}
      value={orgId}
      onChange={setOrgId}
      options={organizations.map((org) => ({
        value: org.id,
        label: org.orgName || org.orgCode || org.yonOrgId,
      }))}
    />
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <OrgProvider>
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Typography.Text strong style={{ color: '#fff', fontSize: 16 }}>
            YonSuite 物料查询平台
          </Typography.Text>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[location.pathname]}
            items={NAV_ITEMS}
            onClick={(e) => navigate(e.key)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <Space>
            <OrgSelect />
            <Typography.Text style={{ color: '#fff' }}>
              {user?.displayName || user?.username}
            </Typography.Text>
            <Button type="link" style={{ color: '#fff' }} onClick={logout}>
              退出
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </OrgProvider>
  );
}
