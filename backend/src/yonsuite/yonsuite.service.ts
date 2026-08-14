import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  YonSuiteAccessToken,
  YonSuiteListResponse,
  YonSuitePageQuery,
} from './yonsuite.types';

/**
 * Thin client around YonSuite's OpenAPI (self-built-app auth).
 *
 * ASSUMPTIONS THAT NEED VERIFYING AGAINST THE REAL TENANT DOCS
 * (this sandbox has no network path to c3.yonyoucloud.com, so none of this
 * has been exercised against a live response — treat it as a first draft):
 *
 *  1. `getAccessToken` takes appKey + appSecret as query params and returns
 *     `{ code, message, data: { access_token, expiresIn, refresh_token } }`.
 *  2. Business list endpoints are called as POST with the access_token and
 *     appKey passed as query params, tenant id passed as `ytenantId` query
 *     param (common YonSuite convention), and the filter/pagination as a
 *     JSON body (`pageIndex`, `pageSize`, plus a `simpleVOs`/condition list
 *     depending on the module — the four endpoints you gave don't all
 *     necessarily share one body shape).
 *
 * If the real responses differ (e.g. token key is `access_token` vs
 * `accessToken`, or the business APIs expect GET + query string instead of
 * POST + body), adjust `fetchAccessToken` / `request` accordingly — the rest
 * of the app only depends on the public methods below, not on these
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
    const response = await this.http.get<Record<string, unknown>>(
      this.authUrl,
      {
        params: {
          appKey: this.appKey,
          appSecret: this.appSecret,
          timestamp: Date.now(),
        },
      },
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
