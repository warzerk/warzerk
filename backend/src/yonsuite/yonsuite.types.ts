export interface YonSuitePageQuery {
  pageIndex?: number;
  pageSize?: number;
  [key: string]: unknown;
}

/**
 * YonSuite list endpoints don't all wrap results the same way across modules.
 * We've seen `{ code, message, data: { recordList, pageIndex, pageSize, recordCount } }`
 * and `{ code, message, data: T[] }` in different parts of the platform.
 * This type covers both shapes; `unwrapList` below normalizes them.
 */
export interface YonSuiteListResponse<T> {
  code: string;
  message?: string;
  data?:
    | {
        recordList?: T[];
        pageIndex?: number;
        pageSize?: number;
        recordCount?: number;
      }
    | T[];
}

export interface YonSuiteAccessToken {
  accessToken: string;
  expiresInSeconds: number;
  obtainedAt: number;
}
