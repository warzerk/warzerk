import 'dotenv/config';

const bool = (value, fallback = false) => value == null ? fallback : value === 'true';

export const config = {
  port: Number(process.env.PORT || 3000),
  demoMode: bool(process.env.DEMO_MODE, true),
  yonSuite: {
    baseUrl: process.env.YONSUITE_BASE_URL || '',
    supplierPath: process.env.YONSUITE_SUPPLIER_PATH || '',
    appKey: process.env.YONSUITE_APP_KEY || '',
    appSecret: process.env.YONSUITE_APP_SECRET || '',
    accessToken: process.env.YONSUITE_ACCESS_TOKEN || '',
    pageSize: Number(process.env.YONSUITE_PAGE_SIZE || 100)
  },
  database: {
    server: process.env.DB_SERVER || '',
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_DATABASE || '',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    options: {
      encrypt: bool(process.env.DB_ENCRYPT),
      trustServerCertificate: bool(process.env.DB_TRUST_SERVER_CERTIFICATE, true)
    }
  }
};

export function connectionState() {
  return {
    yonSuite: Boolean(config.yonSuite.baseUrl && (config.yonSuite.accessToken || config.yonSuite.appKey)),
    database: Boolean(config.database.server && config.database.database && config.database.user && config.database.password),
    demoMode: config.demoMode
  };
}
