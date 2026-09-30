export const demoSuppliers = [
  { id: '10001', code: 'GYS-2024-001', name: '上海恒远工业设备有限公司', status: '启用', category: '生产物料', contact: '周明', phone: '138****6721', taxNumber: '91310115MA1K4X8P2Q', address: '上海市浦东新区金桥路 88 号', updatedAt: '2026-09-28 08:32:16' },
  { id: '10002', code: 'GYS-2024-008', name: '深圳市智联电子科技有限公司', status: '启用', category: '电子元器件', contact: '陈晓', phone: '136****2930', taxNumber: '91440300MA5F7Y6R3K', address: '深圳市南山区科技园科苑路 15 号', updatedAt: '2026-09-27 16:45:09' },
  { id: '10003', code: 'GYS-2025-016', name: '苏州华彩包装材料有限公司', status: '启用', category: '包装辅材', contact: '王琳', phone: '159****8842', taxNumber: '91320594MA22B9N7XL', address: '苏州市工业园区星湖街 328 号', updatedAt: '2026-09-26 11:20:43' },
  { id: '10004', code: 'GYS-2025-023', name: '北京博信企业服务有限公司', status: '停用', category: '服务供应商', contact: '刘洋', phone: '186****4175', taxNumber: '91110108MA01Q2D6XF', address: '北京市海淀区中关村东路 1 号', updatedAt: '2026-09-25 09:12:31' },
  { id: '10005', code: 'GYS-2026-005', name: '宁波宏泰金属制品有限公司', status: '启用', category: '五金配件', contact: '赵凯', phone: '137****6508', taxNumber: '91330206MA2H5C3T8Y', address: '宁波市北仑区大碶街道沿山路 29 号', updatedAt: '2026-09-24 14:58:02' },
  { id: '10006', code: 'GYS-2026-012', name: '杭州云帆信息技术有限公司', status: '启用', category: '软件服务', contact: '孙悦', phone: '180****1129', taxNumber: '91330106MA28M4W5JH', address: '杭州市西湖区文三路 90 号', updatedAt: '2026-09-23 10:05:44' }
].map(item => ({ ...item, raw: item }));
