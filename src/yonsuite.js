import crypto from "node:crypto";
import { normalizeHost } from "./settings.js";

export const VENDOR_LIST_PATH = "/yonbip/digitalModel/vendor/list";

const SUCCESS_CODES = new Set(["200", "00000", "0"]);

/**
 * 用友开放平台自建应用签名：参数名排序后把「名+值」直接拼接，
 * 用 appSecret 做 HmacSHA256，再取 Base64。URL 编码交给 URLSearchParams，避免二次编码。
 */
export function sign(params, appSecret) {
  const plain = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");
  return crypto.createHmac("sha256", appSecret).update(plain, "utf8").digest("base64");
}

export function buildTokenUrl(host, appKey, appSecret, timestamp = Date.now()) {
  const signature = sign({ appKey, timestamp: String(timestamp) }, appSecret);
  const query = new URLSearchParams({
    appKey,
    timestamp: String(timestamp),
    signature,
  });
  return `${normalizeHost(host)}/iuap-api-auth/open-auth/selfAppAuth/getAccessToken?${query}`;
}

export function unwrapYonResponse(json, httpStatus = 200) {
  if (!json || typeof json !== "object") {
    throw new Error(`用友返回的不是 JSON（HTTP ${httpStatus}）`);
  }
  const code = json.code == null ? "" : String(json.code);
  if (code && !SUCCESS_CODES.has(code)) {
    const message = json.message || json.msg || json.error_description || "用友接口返回错误";
    const error = new Error(code === "200" ? message : `${message}（${code}）`);
    error.code = code;
    error.httpStatus = httpStatus;
    throw error;
  }
  if (httpStatus >= 400) {
    const error = new Error(`用友接口 HTTP ${httpStatus}：${json.message || json.msg || "请求失败"}`);
    error.httpStatus = httpStatus;
    error.code = code;
    throw error;
  }
  return json.data === undefined ? json : json.data;
}

export function extractVendorPage(data) {
  const source = data && typeof data === "object" ? data : {};
  const recordList = source.recordList || source.records || source.list || [];
  const list = Array.isArray(recordList) ? recordList : [];
  const recordCount = Number(source.recordCount ?? source.total ?? list.length);
  let pageCount = Number(source.pageCount ?? source.pages ?? 0);
  if (!Number.isFinite(pageCount) || pageCount < 1) pageCount = list.length ? 1 : 0;
  const pageIndex = Number(source.pageIndex ?? source.page ?? 1);
  return {
    recordList: list,
    recordCount: Number.isFinite(recordCount) ? recordCount : list.length,
    pageCount,
    pageIndex: Number.isFinite(pageIndex) ? pageIndex : 1,
  };
}

export function extractVendorDetail(data) {
  if (!data || typeof data !== "object") return null;
  if (data.id != null || data.code != null || data.name != null) return data;
  if (data.vendor && typeof data.vendor === "object") return data.vendor;
  if (data.data && typeof data.data === "object") return extractVendorDetail(data.data);
  return data;
}

function isTokenError(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  return /token|令牌|access_token|310036|310037/i.test(text) && /失效|过期|无效|expired|invalid|token/i.test(text);
}

export function detailLooksMissing(error) {
  const text = `${error?.httpStatus || ""} ${error?.code || ""} ${error?.message || ""}`;
  return /404|405|不存在|未找到|无此|api not found|无效的请求地址|方法不|not allowed/i.test(text);
}

export class YonSuiteClient {
  constructor({ detailPath, detailMethod = "GET", timeoutMs = 30000, fetchImpl = fetch, debug = false } = {}) {
    this.detailPath = detailPath || "/yonbip/digitalModel/vendor/detail";
    this.detailMethod = detailMethod === "POST" ? "POST" : "GET";
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.debug = debug;
    this.cached = null;
  }

  invalidate() {
    this.cached = null;
  }

  async getAccessToken(settings, { force = false } = {}) {
    const cacheKey = `${settings.gatewayHost}|${settings.appKey}`;
    if (!force && this.cached && this.cached.key === cacheKey && Date.now() < this.cached.until) {
      return this.cached.token;
    }
    const url = buildTokenUrl(settings.gatewayHost, settings.appKey, settings.appSecret);
    if (this.debug) console.info("[yonsuite] GET token");
    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    const json = await parseJson(response);
    const data = unwrapYonResponse(json, response.status);
    const token = data?.access_token;
    if (!token) throw new Error("用友没有返回 access_token");
    const expire = Number(data.expire || 7200);
    this.cached = {
      key: cacheKey,
      token,
      until: Date.now() + Math.max(30, expire - 120) * 1000,
    };
    return token;
  }

  async listVendors(settings, body) {
    const data = await this.business(settings, "POST", VENDOR_LIST_PATH, body);
    return extractVendorPage(data);
  }

  async getVendorDetail(settings, id) {
    try {
      return extractVendorDetail(await this.requestDetail(settings, id, this.detailMethod));
    } catch (error) {
      if (!detailLooksMissing(error)) throw error;
      const alternate = this.detailMethod === "GET" ? "POST" : "GET";
      try {
        const data = extractVendorDetail(await this.requestDetail(settings, id, alternate));
        this.detailMethod = alternate;
        return data;
      } catch (second) {
        const wrapped = new Error(`${error.message}；改用 ${alternate} 仍失败：${second.message}`);
        wrapped.httpStatus = second.httpStatus || error.httpStatus;
        wrapped.code = second.code || error.code;
        throw wrapped;
      }
    }
  }

  async requestDetail(settings, id, method) {
    if (method === "POST") {
      return this.business(settings, "POST", this.detailPath, { id: String(id) });
    }
    const path = `${this.detailPath}${this.detailPath.includes("?") ? "&" : "?"}id=${encodeURIComponent(id)}`;
    return this.business(settings, "GET", path);
  }

  async business(settings, method, path, body, retried = false) {
    const token = await this.getAccessToken(settings);
    const base = `${normalizeHost(settings.gatewayHost)}/iuap-api-gateway${path.startsWith("/") ? path : `/${path}`}`;
    const url = new URL(base);
    url.searchParams.set("access_token", token);
    if (this.debug) console.info(`[yonsuite] ${method} ${path.split("?")[0]}`);
    const response = await this.fetchImpl(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const json = await parseJson(response);
    try {
      if (!response.ok) {
        const message = json?.message || json?.msg || response.statusText || "请求失败";
        const error = new Error(`用友接口 HTTP ${response.status}：${message}`);
        error.httpStatus = response.status;
        error.code = json?.code == null ? "" : String(json.code);
        throw error;
      }
      return unwrapYonResponse(json, response.status);
    } catch (error) {
      if (!retried && isTokenError(error)) {
        await this.getAccessToken(settings, { force: true });
        return this.business(settings, method, path, body, true);
      }
      throw error;
    }
  }
}

/**
 * 用友供应商 ID 超过 JS 安全整数。先把 16 位及以上的整型改成字符串再解析，
 * 避免 2639529439088607232 被收成 2639529439088607000 后详情接口查不到。
 */
export function parseYonJson(text) {
  if (!text) return {};
  let out = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      out += char;
      continue;
    }
    if (char === "-" || (char >= "0" && char <= "9")) {
      let end = index;
      if (text[end] === "-") end += 1;
      const digitsStart = end;
      while (end < text.length && text[end] >= "0" && text[end] <= "9") end += 1;
      const follower = text[end] || "";
      const isFloat = follower === "." || follower === "e" || follower === "E";
      if (!isFloat && end - digitsStart >= 16) {
        out += `"${text.slice(index, end)}"`;
        index = end - 1;
        continue;
      }
    }
    out += char;
  }
  return JSON.parse(out);
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return parseYonJson(text);
  } catch {
    throw new Error(`用友返回的不是 JSON（HTTP ${response.status}）`);
  }
}
