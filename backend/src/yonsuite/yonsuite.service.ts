import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { createHmac } from 'node:crypto';
import {
  YonSuiteAccessToken,
  YonSuiteListResponse,
  YonSuitePageQuery,
} from './yonsuite.types';

/**
 * YonSuite's signing scheme: sort params by name, concatenate as
 * name+value pairs (no separators), HMAC-SHA256 the result keyed by
 * appSecret, then base64-encode the digest. The resulting base64 string is
 * passed as-is into axios `params` — axios percent-encodes query values
 * itself, which is what the platform's docs describe as the final
 * "urlEncode" step; encoding it again here would double-encode it.
 */
function signParams(
  params: Record<string, string | number>,
  appSecret: string,
): string {
  const raw = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('');
  return createHmac('sha256', appSecret).update(raw, 'utf8').digest('base64');
}

/**
 * Thin client around YonSuite's OpenAPI (self-built-app auth).
 *
 * CONFIRMED against the live tenant (via real error responses):
 *  - `getAccessToken` requires `appKey` + `timestamp` (ms epoch) +
 *    `signature` (HMAC-SHA256 per `signParams` above, keyed by appSecret).
 *    appSecret itself is never sent as a request parameter.
 *
 * STILL UNVERIFIED (this sandbox has no network path to
 * c3.yonyoucloud.com, so business-endpoint behavior hasn't been exercised
 * against a live response yet):
 *  - The exact shape of `{ code, message, data: { access_token, ... } }` —
 *    field names (`access_token` vs `accessToken`) are guessed with
 *    fallbacks in `fetchAccessToken`.
 *  - Whether business list endpoints (sales/purchase/production orders,
 *    BOM, stock) need the same signature scheme applied per-request, or
 *    authenticate purely via the bearer `access_token` as currently
 *    implemented in `post()`. If a business call comes back complaining
 *    about a missing/invalid signature, apply `signParams` there too.
 *  - Whether business calls are POST+JSON-body (current assumption) or
 *    GET+query string, and their pagination/field names.
 *
 * If reality differs, adjust `fetchAccessToken` / `post` accordingly — the
 * rest of the app only depends on the public methods below, not on these
 * internals.
 */
@Injectable()
export class YonSuiteService {
  private readonly logger = new Logger(YonSuiteService.name);
  private readonly http: AxiosInstance;
  private readonly gatewayBaseUrl: string;
  private readonly authUrl: string;
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly tenantId: string;

  private cachedToken: YonSuiteAccessToken | null = null;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {
    this.gatewayBaseUrl = this.config.getOrThrow<string>(
      'YONSUITE_GATEWAY_BASE_URL',
    );
    this.authUrl = this.config.getOrThrow<string>('YONSUITE_AUTH_URL');
    this.appKey = this.config.getOrThrow<string>('YONSUITE_APP_KEY');
    this.appSecret = this.config.getOrThrow<string>('YONSUITE_APP_SECRET');
    this.tenantId = this.config.getOrThrow<string>('YONSUITE_TENANT_ID');
    this.http = axios.create({ timeout: 20_000 });
  }

  private async fetchAccessToken(): Promise<{
    accessToken: string;
    expiresInSeconds: number;
  }> {
    const signedParams = { appKey: this.appKey, timestamp: Date.now() };
    const signature = signParams(signedParams, this.appSecret);

    const response = await this.http.get<Record<string, unknown>>(
      this.authUrl,
      { params: { ...signedParams, signature } },
    );

    const body = response.data ?? {};
    const data = isRecord(body.data) ? body.data : body;
    const accessToken = firstString(data, [
      'access_token',
      'accessToken',
      'token',
    ]);
    const expiresInSeconds =
      firstNumber(data, ['expiresIn', 'expires_in', 'expireTime']) ?? 7200;

    if (!accessToken) {
      this.logger.error(
        `YonSuite getAccessToken returned no token: ${JSON.stringify(body)}`,
      );
      throw new HttpException('Failed to obtain YonSuite access token', 502);
    }

    return { accessToken, expiresInSeconds };
  }

  /** Returns a cached token, refreshing ~5 minutes before expiry. */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    const safetyMarginMs = 5 * 60 * 1000;

    if (
      this.cachedToken &&
      now - this.cachedToken.obtainedAt <
        this.cachedToken.expiresInSeconds * 1000 - safetyMarginMs
    ) {
      return this.cachedToken.accessToken;
    }

    if (!this.tokenRefreshPromise) {
      this.tokenRefreshPromise = this.fetchAccessToken()
        .then(({ accessToken, expiresInSeconds }) => {
          this.cachedToken = {
            accessToken,
            expiresInSeconds,
            obtainedAt: Date.now(),
          };
          return accessToken;
        })
        .finally(() => {
          this.tokenRefreshPromise = null;
        });
    }

    return this.tokenRefreshPromise;
  }

  /** Generic authenticated POST against a YonSuite gateway path. */
  async post<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<YonSuiteListResponse<T>> {
    const accessToken = await this.getAccessToken();
    const url = `${this.gatewayBaseUrl}${path}`;

    const response = await this.http.post<YonSuiteListResponse<T>>(url, body, {
      params: {
        access_token: accessToken,
        appKey: this.appKey,
        ytenantId: this.tenantId,
      },
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.data?.code && response.data.code !== '200') {
      this.logger.warn(
        `YonSuite ${path} returned non-200 code: ${JSON.stringify(response.data)}`,
      );
    }

    return response.data;
  }

  /** Normalizes the two list-response shapes YonSuite modules use. */
  static unwrapList<T>(response: YonSuiteListResponse<T>): T[] {
    const data = response?.data;
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return data.recordList ?? [];
  }

  listSalesOrders(query: YonSuitePageQuery) {
    return this.post('/yonbip/sd/voucherorder/list', query);
  }

  listPurchaseOrders(query: YonSuitePageQuery) {
    return this.post('/yonbip/scm/purchaseorder/list', query);
  }

  listProductionOrders(query: YonSuitePageQuery) {
    return this.post('/yonbip/mfg/productionorder/list', query);
  }

  listBom(query: YonSuitePageQuery) {
    return this.post('/yonbip/mfg/v1.0/bom/list', query);
  }

  /** Real-time current stock — never cached beyond the caller's own TTL. */
  queryCurrentStocks(query: YonSuitePageQuery) {
    return this.post('/yonbip/scm/stock/QueryCurrentStocksByCondition', query);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return undefined;
}

function firstNumber(
  obj: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (
      typeof value === 'string' &&
      value !== '' &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value);
    }
  }
  return undefined;
}
