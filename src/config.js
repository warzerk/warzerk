import "dotenv/config";

function readHour(value) {
  if (value == null || String(value).trim() === "") return null;
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("SYNC_DAILY_HOUR 需要是 0 到 23 的整数，或留空");
  }
  return hour;
}

export function loadConfig(env = process.env) {
  const dbDriver = String(env.DB_DRIVER || "sqlite").trim().toLowerCase();
  if (!["sqlite", "mssql"].includes(dbDriver)) {
    throw new Error("DB_DRIVER 只能是 sqlite 或 mssql");
  }
  return {
    port: Number(env.PORT || 3000),
    dbDriver,
    sqlitePath: env.SQLITE_PATH || "data/vendors.db",
    mssql: {
      server: env.MSSQL_SERVER || "localhost",
      port: Number(env.MSSQL_PORT || 1433),
      database: env.MSSQL_DATABASE || "yonsuite",
      user: env.MSSQL_USER || "",
      password: env.MSSQL_PASSWORD || "",
      encrypt: env.MSSQL_ENCRYPT !== "false",
      trustServerCertificate: env.MSSQL_TRUST_CERT !== "false",
    },
    detailPath: env.YONSUITE_DETAIL_PATH || "/yonbip/digitalModel/vendor/detail",
    detailMethod: String(env.YONSUITE_DETAIL_METHOD || "GET").toUpperCase() === "POST" ? "POST" : "GET",
    detailConcurrency: Math.min(8, Math.max(1, Number(env.YONSUITE_DETAIL_CONCURRENCY || 4))),
    syncDailyHour: readHour(env.SYNC_DAILY_HOUR),
    debug: env.YONSUITE_DEBUG === "1",
  };
}
