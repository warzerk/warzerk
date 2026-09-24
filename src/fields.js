export const FIELD_LABELS = {
  id: "供应商ID",
  code: "供应商编码",
  name: "供应商名称",
  simplename: "供应商简称",
  helpcode: "助记码",
  org: "管理组织ID",
  org_name: "管理组织",
  orgId: "适用组织ID",
  vendorclass: "供应商分类ID",
  vendorclass_name: "供应商分类",
  creditcode: "统一社会信用代码",
  vendorzipcode: "邮政编码",
  contactphone: "联系人电话",
  vendorphone: "供应商电话",
  vendoremail: "电子邮箱",
  address: "地址",
  vendoraddress: "供应商地址",
  regionCode: "行政区划",
  stop: "停用状态",
  stopstatus: "停用状态",
  freezestatus: "冻结状态",
  accessstatus: "准入状态",
  pubts: "时间戳",
  datasource: "供应商来源",
  supplyType: "供应商类型",
  companytype: "企业类型",
  legalBody: "法人代表",
  registerFund: "注册资金",
  registerCurrency: "注册资金币种ID",
  registerCurrency_name: "注册资金币种",
  foundDate: "成立日期",
  serviceRange: "经营范围",
  remark: "备注",
  taxPayingCategories: "纳税类别",
  internalunit: "内部单位",
  retailInvestors: "散户",
  correspondingorg: "对应组织ID",
  correspondingorg_name: "对应组织",
  correspondingcust: "对应客户ID",
  correspondingcust_name: "对应客户",
  parentVendor: "上级供应商ID",
  parentVendor_name: "上级供应商",
  vendorApplyRange_org: "适用范围组织ID",
  vendorApplyRange_org_name: "适用范围组织",
  vendorApplyRangeId: "适用范围ID",
  country: "国家地区ID",
  country_name: "国家地区",
  language: "语言",
  trade: "所属行业",
  ycnCode: "YCN编码",
  timeZone: "时区",
  timeZone_Name: "时区名称",
  department: "专管部门ID",
  department_code: "专管部门编码",
  department_name: "专管部门",
  person: "专管业务员ID",
  person_name: "专管业务员",
  currency: "交易币种ID",
  currencyname: "交易币种",
  currencyName: "币种",
  taxrate: "进项税率",
  taxitems: "税目ID",
  taxname: "税目",
  shipvia: "发运方式ID",
  shipvia_name: "发运方式",
  deliveryvendor: "发货供应商ID",
  deliveryvendor_name: "发货供应商",
  invoicevendor: "开票供应商ID",
  invoicevendor_name: "开票供应商",
  settlemethod: "结算方式ID",
  settlemethod_name: "结算方式",
  paymentagreement: "付款协议ID",
  paymentagreement_name: "付款协议",
  exchangeratetype: "汇率类型ID",
  exchangeratetype_Name: "汇率类型",
  creditServiceDay: "信用期限（天）",
  creator: "创建人",
  createTime: "创建时间",
  modifier: "修改人",
  modifyTime: "修改时间",
  yhttenant: "租户ID",
  tenant: "租户ID",
  isCreator: "是否创建者",
  isApplied: "是否被使用者引用",
  customItems: "自定义项",
  vendorextends: "业务信息",
  contactname: "联系人",
  contactmobile: "联系人手机",
  defaultcontact: "默认联系人",
  relationEnterpriseId: "关联企业ID",
  relationEnterpriseId_name: "关联企业",
  applyRanges: "适用范围",
  detailError: "详情拉取说明",
  bank: "开户行ID",
  bank_name: "开户银行",
  openaccountbank: "开户银行",
  account: "银行账号",
  bankAccount: "银行账号",
  accountname: "账户名称",
  accountType: "账户类型",
  defaultbank: "默认银行账户",
  creatorType: "创建类型",
  zh_CN: "简体中文",
  zh_cn: "简体中文",
  en_US: "英文",
};

export const PREFERRED_FIELDS = [
  "code",
  "name",
  "simplename",
  "helpcode",
  "vendorclass_name",
  "vendorclass",
  "org_name",
  "org",
  "creditcode",
  "supplyType",
  "companytype",
  "legalBody",
  "accessstatus",
  "stop",
  "stopstatus",
  "freezestatus",
  "contactphone",
  "vendorphone",
  "vendoremail",
  "address",
  "vendoraddress",
  "regionCode",
  "vendorzipcode",
  "country_name",
  "trade",
  "foundDate",
  "registerFund",
  "registerCurrency_name",
  "serviceRange",
  "person_name",
  "department_name",
  "currencyname",
  "taxrate",
  "taxname",
  "paymentagreement_name",
  "settlemethod_name",
  "invoicevendor_name",
  "deliveryvendor_name",
  "parentVendor_name",
  "correspondingcust_name",
  "internalunit",
  "retailInvestors",
  "datasource",
  "remark",
  "creator",
  "createTime",
  "modifier",
  "modifyTime",
  "pubts",
  "id",
];

const ACCESS_STATUS = {
  0: "初评",
  1: "合格准入",
  2: "临时准入",
  3: "不合格",
};

const SUPPLY_TYPE = {
  0: "企业",
  1: "个人",
  2: "其他",
};

const COMPANY_TYPE = {
  0: "生产商",
  1: "代理商",
  2: "服务商",
  3: "其他",
  4: "贸易商",
};

const DATA_SOURCE = {
  0: "零售系统",
  1: "后台下发",
  2: "物料中心",
};

const ENUMS = {
  accessstatus: ACCESS_STATUS,
  supplyType: SUPPLY_TYPE,
  companytype: COMPANY_TYPE,
  datasource: DATA_SOURCE,
};

export function labelFor(key) {
  const text = String(key);
  if (FIELD_LABELS[text]) return FIELD_LABELS[text];
  const parts = text.split(".");
  if (parts.length === 1) return text;
  return parts.map((part) => FIELD_LABELS[part] || part).join(" · ");
}

export function preferredIndex(key) {
  const leaf = String(key).split(".").pop();
  const index = PREFERRED_FIELDS.indexOf(leaf);
  return index === -1 ? 1000 : index;
}

function truthy(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function falsy(value) {
  return value === false || value === "false" || value === 0 || value === "0";
}

export function formatCell(key, value) {
  if (value == null || value === "") return "";
  const leaf = String(key).split(".").pop();
  if (leaf === "stop" || leaf === "stopstatus") {
    if (truthy(value)) return "停用";
    if (falsy(value)) return "启用";
  }
  if (leaf === "freezestatus") {
    if (truthy(value)) return "冻结";
    if (falsy(value)) return "正常";
  }
  if (typeof value === "boolean" || value === "true" || value === "false") {
    return truthy(value) ? "是" : "否";
  }
  const table = ENUMS[leaf];
  if (table && Object.prototype.hasOwnProperty.call(table, String(value))) {
    return table[String(value)];
  }
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}
