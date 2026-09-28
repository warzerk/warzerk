export function normalizeHost(host) {
  return String(host || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/iuap-api-gateway$/i, "")
    .replace(/\/iuap-api-auth$/i, "");
}

export function clampPageSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size)) return 100;
  return Math.min(500, Math.max(10, Math.round(size)));
}

export function assertHost(host) {
  if (!host) return;
  let url;
  try {
    url = new URL(host);
  } catch {
    throw Object.assign(new Error("数据中心地址不是合法 URL"), { status: 400 });
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw Object.assign(new Error("数据中心地址需以 http 或 https 开头"), { status: 400 });
  }
  if (url.pathname && url.pathname !== "/") {
    throw Object.assign(new Error("只需填写数据中心根地址，例如 https://c1.yonyoucloud.com"), { status: 400 });
  }
}

export function assertReady(settings) {
  if (!settings.gatewayHost) {
    throw Object.assign(new Error("请填写数据中心地址"), { status: 400 });
  }
  assertHost(settings.gatewayHost);
  if (!settings.appKey) {
    throw Object.assign(new Error("请填写 AppKey"), { status: 400 });
  }
  if (!settings.appSecret) {
    throw Object.assign(new Error("请填写 AppSecret"), { status: 400 });
  }
}

export function mergeDraft(current, input = {}) {
  const next = {
    gatewayHost: input.gatewayHost != null ? normalizeHost(input.gatewayHost) : current.gatewayHost || "",
    appKey: input.appKey != null ? String(input.appKey).trim() : current.appKey || "",
    appSecret: input.appSecret ? String(input.appSecret) : current.appSecret || "",
    pageSize: input.pageSize != null ? clampPageSize(input.pageSize) : clampPageSize(current.pageSize),
    enrichDetail: input.enrichDetail != null ? Boolean(input.enrichDetail) : Boolean(current.enrichDetail),
    org: input.org != null ? String(input.org).trim() : current.org || "",
    vendorOrg: input.vendorOrg != null ? String(input.vendorOrg).trim() : current.vendorOrg || "",
  };
  assertHost(next.gatewayHost);
  return next;
}

export function publicSettings(settings) {
  const secret = settings.appSecret || "";
  return {
    gatewayHost: settings.gatewayHost || "",
    appKey: settings.appKey || "",
    appSecretSet: Boolean(secret),
    appSecretMask: secret ? `已保存，末四位 ${secret.slice(-4)}` : "",
    pageSize: settings.pageSize || 100,
    enrichDetail: Boolean(settings.enrichDetail),
    org: settings.org || "",
    vendorOrg: settings.vendorOrg || "",
  };
}
