import { config } from './config.js';

function normalize(item) {
  return {
    id: String(item.id ?? item.vendorId ?? item.pk_vendor ?? item.code ?? ''),
    code: String(item.code ?? item.vendorCode ?? item.vcode ?? ''),
    name: item.name ?? item.vendorName ?? item.vname ?? '',
    status: item.statusName ?? item.status ?? (item.enable === false ? '停用' : '启用'),
    category: item.categoryName ?? item.vendorClassName ?? item.category ?? '',
    contact: item.contact ?? item.linkman ?? '',
    phone: item.phone ?? item.mobile ?? '',
    taxNumber: item.taxNumber ?? item.taxNo ?? item.taxnum ?? '',
    address: item.address ?? item.detailAddress ?? '',
    updatedAt: item.updatedAt ?? item.modifyTime ?? item.updateTime ?? '',
    raw: item
  };
}

function extractPage(body) {
  const data = body.data ?? body;
  const rows = data.items ?? data.records ?? data.rows ?? data.list ?? [];
  return { rows, total: Number(data.total ?? data.totalCount ?? rows.length) };
}

export async function fetchAllSuppliers() {
  const { baseUrl, supplierPath, accessToken, appKey, appSecret, pageSize } = config.yonSuite;
  if (!baseUrl || !supplierPath) throw new Error('YonSuite API 地址尚未配置');
  const all = [];
  for (let page = 1; ; page += 1) {
    const url = new URL(supplierPath, baseUrl);
    url.searchParams.set('pageIndex', String(page));
    url.searchParams.set('pageSize', String(pageSize));
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(appKey ? { 'X-App-Key': appKey } : {}),
        ...(appSecret ? { 'X-App-Secret': appSecret } : {})
      },
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`YonSuite API 请求失败（HTTP ${response.status}）`);
    const body = await response.json();
    if (body.success === false || body.code && !['0', '200', 0, 200].includes(body.code)) {
      throw new Error(body.message || body.msg || 'YonSuite API 返回业务错误');
    }
    const { rows, total } = extractPage(body);
    all.push(...rows.map(normalize));
    if (!rows.length || all.length >= total || rows.length < pageSize) break;
  }
  return all;
}
