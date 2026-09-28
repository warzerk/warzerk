import fs from "node:fs";
import path from "node:path";
import { clampPageSize, mergeDraft } from "./settings.js";

const SEARCH_COLUMNS = [
  "code",
  "name",
  "simplename",
  "helpcode",
  "creditcode",
  "contactphone",
  "org_name",
  "vendorclass_name",
  "address",
];

function likePattern(value) {
  return `%${String(value).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function stoppedParam(value) {
  if (value === 0 || value === "0") return 0;
  if (value === 1 || value === "1") return 1;
  return null;
}

function paging(query) {
  const page = Math.max(1, Math.trunc(Number(query.page) || 1));
  const pageSize = Math.min(200, Math.max(1, Math.trunc(Number(query.pageSize) || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function mapVendor(row) {
  if (!row) return null;
  let payload = {};
  try {
    payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload || {};
  } catch {
    payload = {};
  }
  const syncedAt = row.synced_at instanceof Date ? row.synced_at.toISOString() : row.synced_at || "";
  return {
    vendorId: String(row.vendor_id),
    code: row.code || "",
    name: row.name || "",
    simplename: row.simplename || "",
    helpcode: row.helpcode || "",
    orgName: row.org_name || "",
    vendorclassName: row.vendorclass_name || "",
    creditcode: row.creditcode || "",
    contactphone: row.contactphone || "",
    address: row.address || "",
    stopped: row.stopped ? 1 : 0,
    accessstatus: row.accessstatus || "",
    pubts: row.pubts || "",
    detailLoaded: row.detail_loaded ? 1 : 0,
    detailError: row.detail_error || "",
    payload,
    syncedAt,
  };
}

function mapSettings(row) {
  return {
    gatewayHost: row?.gateway_host || "",
    appKey: row?.app_key || "",
    appSecret: row?.app_secret || "",
    pageSize: clampPageSize(row?.page_size),
    enrichDetail: row ? Boolean(row.enrich_detail) : true,
    org: row?.org || "",
    vendorOrg: row?.vendor_org || "",
  };
}

function seedFromEnv() {
  return {
    gatewayHost: process.env.YONSUITE_HOST || "",
    appKey: process.env.YONSUITE_APP_KEY || "",
    appSecret: process.env.YONSUITE_APP_SECRET || "",
    pageSize: clampPageSize(process.env.YONSUITE_PAGE_SIZE || 100),
    enrichDetail: process.env.YONSUITE_ENRICH_DETAIL !== "false",
    org: process.env.YONSUITE_ORG || "",
    vendorOrg: process.env.YONSUITE_VENDOR_ORG || "",
  };
}

function clipMessage(message) {
  return String(message || "").slice(0, 4000);
}

export async function createStore(config) {
  if (config.dbDriver === "mssql") return createMssqlStore(config);
  return createSqliteStore(config);
}

function createSqliteStore(config) {
  let db;
  let chain = Promise.resolve();
  const locked = (fn) => {
    const run = chain.then(() => fn());
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const api = {
    driver: "sqlite",
    describe() {
      return config.sqlitePath;
    },
    init() {
      return locked(async () => {
        const filename = path.resolve(config.sqlitePath);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        const { DatabaseSync } = await import("node:sqlite");
        db = new DatabaseSync(filename);
        db.exec(`
          PRAGMA journal_mode = WAL;
          PRAGMA busy_timeout = 5000;
          CREATE TABLE IF NOT EXISTS vendors (
            vendor_id TEXT PRIMARY KEY,
            code TEXT,
            name TEXT,
            simplename TEXT,
            helpcode TEXT,
            org_name TEXT,
            vendorclass_name TEXT,
            creditcode TEXT,
            contactphone TEXT,
            address TEXT,
            stopped INTEGER NOT NULL DEFAULT 0,
            accessstatus TEXT,
            pubts TEXT,
            detail_loaded INTEGER NOT NULL DEFAULT 0,
            detail_error TEXT,
            payload TEXT NOT NULL,
            synced_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_vendors_code ON vendors(code);
          CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);
          CREATE INDEX IF NOT EXISTS idx_vendors_stopped ON vendors(stopped);
          CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            gateway_host TEXT NOT NULL DEFAULT '',
            app_key TEXT NOT NULL DEFAULT '',
            app_secret TEXT NOT NULL DEFAULT '',
            page_size INTEGER NOT NULL DEFAULT 100,
            enrich_detail INTEGER NOT NULL DEFAULT 1,
            org TEXT NOT NULL DEFAULT '',
            vendor_org TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS sync_state (
            state_key TEXT PRIMARY KEY,
            state_value TEXT
          );
          CREATE TABLE IF NOT EXISTS sync_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mode TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            fetched INTEGER NOT NULL DEFAULT 0,
            upserted INTEGER NOT NULL DEFAULT 0,
            removed INTEGER NOT NULL DEFAULT 0,
            message TEXT
          );
        `);
        const existing = db.prepare("SELECT id FROM app_settings WHERE id = 1").get();
        if (!existing) {
          const seed = seedFromEnv();
          db.prepare(`
            INSERT INTO app_settings (
              id, gateway_host, app_key, app_secret, page_size, enrich_detail, org, vendor_org, updated_at
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            seed.gatewayHost,
            seed.appKey,
            seed.appSecret,
            seed.pageSize,
            seed.enrichDetail ? 1 : 0,
            seed.org,
            seed.vendorOrg,
            new Date().toISOString(),
          );
        }
      });
    },
    close() {
      return locked(() => {
        db?.close();
      });
    },
    getSettings() {
      return locked(() => mapSettings(db.prepare("SELECT * FROM app_settings WHERE id = 1").get()));
    },
    saveSettings(input) {
      return locked(async () => {
        const current = mapSettings(db.prepare("SELECT * FROM app_settings WHERE id = 1").get());
        const next = mergeDraft(current, input);
        db.prepare(`
          UPDATE app_settings SET
            gateway_host = ?, app_key = ?, app_secret = ?, page_size = ?, enrich_detail = ?,
            org = ?, vendor_org = ?, updated_at = ?
          WHERE id = 1
        `).run(
          next.gatewayHost,
          next.appKey,
          next.appSecret,
          next.pageSize,
          next.enrichDetail ? 1 : 0,
          next.org,
          next.vendorOrg,
          new Date().toISOString(),
        );
        return next;
      });
    },
    getState(key) {
      return locked(() => db.prepare("SELECT state_value FROM sync_state WHERE state_key = ?").get(key)?.state_value || "");
    },
    setState(key, value) {
      return locked(() => {
        db.prepare(`
          INSERT INTO sync_state (state_key, state_value) VALUES (?, ?)
          ON CONFLICT(state_key) DO UPDATE SET state_value = excluded.state_value
        `).run(key, value == null ? "" : String(value));
      });
    },
    startRun(mode) {
      return locked(() => {
        const info = db.prepare(`
          INSERT INTO sync_runs (mode, status, started_at, fetched, upserted, removed, message)
          VALUES (?, 'running', ?, 0, 0, 0, '')
        `).run(mode, new Date().toISOString());
        return Number(info.lastInsertRowid);
      });
    },
    finishRun(id, result) {
      return locked(() => {
        db.prepare(`
          UPDATE sync_runs SET status = ?, finished_at = ?, fetched = ?, upserted = ?, removed = ?, message = ?
          WHERE id = ?
        `).run(
          result.status,
          new Date().toISOString(),
          result.fetched || 0,
          result.upserted || 0,
          result.removed || 0,
          clipMessage(result.message),
          id,
        );
      });
    },
    listRuns() {
      return locked(() =>
        db.prepare(`
          SELECT id, mode, status, started_at, finished_at, fetched, upserted, removed, message
          FROM sync_runs ORDER BY id DESC LIMIT 20
        `).all().map((row) => ({
          id: row.id,
          mode: row.mode,
          status: row.status,
          startedAt: row.started_at,
          finishedAt: row.finished_at || "",
          fetched: row.fetched,
          upserted: row.upserted,
          removed: row.removed,
          message: row.message || "",
        })),
      );
    },
    upsertMany(rows) {
      return locked(() => {
        if (!rows.length) return 0;
        const statement = db.prepare(`
          INSERT INTO vendors (
            vendor_id, code, name, simplename, helpcode, org_name, vendorclass_name,
            creditcode, contactphone, address, stopped, accessstatus, pubts,
            detail_loaded, detail_error, payload, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(vendor_id) DO UPDATE SET
            code = excluded.code,
            name = excluded.name,
            simplename = excluded.simplename,
            helpcode = excluded.helpcode,
            org_name = excluded.org_name,
            vendorclass_name = excluded.vendorclass_name,
            creditcode = excluded.creditcode,
            contactphone = excluded.contactphone,
            address = excluded.address,
            stopped = excluded.stopped,
            accessstatus = excluded.accessstatus,
            pubts = excluded.pubts,
            detail_loaded = excluded.detail_loaded,
            detail_error = excluded.detail_error,
            payload = excluded.payload,
            synced_at = excluded.synced_at
        `);
        const now = new Date().toISOString();
        db.exec("BEGIN IMMEDIATE");
        try {
          for (const row of rows) statement.run(...vendorParams(row, now));
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        return rows.length;
      });
    },
    retainOnly(ids) {
      return locked(() => {
        if (!ids.length) return 0;
        db.exec("BEGIN IMMEDIATE");
        try {
          db.exec("CREATE TEMP TABLE IF NOT EXISTS keep_ids (vendor_id TEXT PRIMARY KEY)");
          db.exec("DELETE FROM keep_ids");
          const insert = db.prepare("INSERT INTO keep_ids (vendor_id) VALUES (?)");
          for (const id of ids) insert.run(id);
          const info = db.prepare("DELETE FROM vendors WHERE vendor_id NOT IN (SELECT vendor_id FROM keep_ids)").run();
          db.exec("COMMIT");
          return Number(info.changes || 0);
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      });
    },
    countVendors(filter) {
      return locked(() => {
        const compiled = compileSqliteFilter(filter);
        const row = db.prepare(`SELECT COUNT(*) AS total FROM vendors ${compiled.sql}`).get(...compiled.params);
        return Number(row?.total || 0);
      });
    },
    listVendorStamps() {
      return locked(() =>
        db.prepare("SELECT vendor_id, pubts, detail_loaded FROM vendors").all().map((row) => ({
          vendorId: String(row.vendor_id),
          pubts: row.pubts || "",
          detailLoaded: Boolean(row.detail_loaded),
        })),
      );
    },
    queryVendors(filter) {
      return locked(() => {
        const pageInfo = paging(filter);
        const compiled = compileSqliteFilter(filter);
        const total = Number(
          db.prepare(`SELECT COUNT(*) AS total FROM vendors ${compiled.sql}`).get(...compiled.params)?.total || 0,
        );
        const columns = filter.includePayload
          ? "*"
          : `vendor_id, code, name, simplename, helpcode, org_name, vendorclass_name, creditcode,
             contactphone, address, stopped, accessstatus, pubts, detail_loaded, detail_error, synced_at`;
        const rows = db.prepare(`
          SELECT ${columns} FROM vendors ${compiled.sql}
          ORDER BY code, vendor_id
          LIMIT ? OFFSET ?
        `).all(...compiled.params, pageInfo.pageSize, pageInfo.offset);
        return {
          total,
          page: pageInfo.page,
          pageSize: pageInfo.pageSize,
          items: rows.map((row) => mapVendor({ ...row, payload: row.payload || "{}" })),
        };
      });
    },
    getVendor(vendorId) {
      return locked(() => mapVendor(db.prepare("SELECT * FROM vendors WHERE vendor_id = ?").get(vendorId)));
    },
    listVendorsForExport(filter) {
      return locked(() => {
        const compiled = compileSqliteFilter(filter);
        return db.prepare(`SELECT * FROM vendors ${compiled.sql} ORDER BY code, vendor_id`)
          .all(...compiled.params)
          .map((row) => mapVendor(row));
      });
    },
  };
  return api;
}

function vendorParams(row, syncedAt) {
  return [
    row.vendorId,
    row.code,
    row.name,
    row.simplename,
    row.helpcode,
    row.orgName,
    row.vendorclassName,
    row.creditcode,
    row.contactphone,
    row.address,
    row.stopped ? 1 : 0,
    row.accessstatus,
    row.pubts,
    row.detailLoaded ? 1 : 0,
    row.detailError || null,
    JSON.stringify(row.payload || {}),
    syncedAt,
  ];
}

function compileSqliteFilter(filter) {
  const where = [];
  const params = [];
  const keyword = String(filter.q || "").trim();
  if (keyword) {
    const like = likePattern(keyword);
    where.push(`(${SEARCH_COLUMNS.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    for (let index = 0; index < SEARCH_COLUMNS.length; index += 1) params.push(like);
  }
  const stopped = stoppedParam(filter.stopped);
  if (stopped != null) {
    where.push("stopped = ?");
    params.push(stopped);
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

async function createMssqlStore(config) {
  const mssql = (await import("mssql")).default;
  const poolConfig = {
    server: config.mssql.server,
    port: config.mssql.port,
    database: config.mssql.database,
    user: config.mssql.user,
    password: config.mssql.password,
    connectionTimeout: config.mssql.connectionTimeout,
    requestTimeout: config.mssql.requestTimeout,
    options: {
      encrypt: config.mssql.encrypt,
      trustServerCertificate: config.mssql.trustServerCertificate,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 60000 },
  };
  let pool = new mssql.ConnectionPool(poolConfig);
  await pool.connect();

  function request() {
    return pool.request();
  }

  function connectionDead(error) {
    const text = `${error?.code || ""} ${error?.message || ""} ${error?.originalError?.message || ""}`;
    return /LoggedIn state|ECONNRESET|Connection lost|ConnectionError|socket hang up|EPIPE|ECONNCLOSED/i.test(text);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function reconnect() {
    try {
      await pool.close();
    } catch {
      // 旧连接已经断开时关闭会失败，继续重建即可。
    }
    pool = new mssql.ConnectionPool(poolConfig);
    await pool.connect();
  }

  async function withPool(fn) {
    let last;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        last = error;
        if (!connectionDead(error) || attempt === 4) throw error;
        console.warn(`[store] SQL Server 连接中断，${attempt + 1}/4 次后重试：${error.message}`);
        await sleep(1200 * (attempt + 1));
        try {
          await reconnect();
        } catch (connectError) {
          last = connectError;
          console.warn(`[store] 重连失败：${connectError.message}`);
        }
      }
    }
    throw last;
  }

  function bindFilter(req, filter) {
    const where = [];
    const keyword = String(filter.q || "").trim();
    if (keyword) {
      req.input("like", mssql.NVarChar, likePattern(keyword));
      where.push(`(${SEARCH_COLUMNS.map((column) => `${column} LIKE @like ESCAPE '\\'`).join(" OR ")})`);
    }
    const stopped = stoppedParam(filter.stopped);
    if (stopped != null) {
      req.input("stopped", mssql.Bit, stopped);
      where.push("stopped = @stopped");
    }
    return where.length ? `WHERE ${where.join(" AND ")}` : "";
  }

  function clipColumn(value, max) {
    if (value == null || value === "") return null;
    const text = String(value);
    return text.length > max ? text.slice(0, max) : text;
  }

  function openJsonVendor(row) {
    return {
      vendorId: clipColumn(row.vendorId, 64),
      code: clipColumn(row.code, 128),
      name: clipColumn(row.name, 500),
      simplename: clipColumn(row.simplename, 256),
      helpcode: clipColumn(row.helpcode, 128),
      orgName: clipColumn(row.orgName, 256),
      vendorclassName: clipColumn(row.vendorclassName, 256),
      creditcode: clipColumn(row.creditcode, 64),
      contactphone: clipColumn(row.contactphone, 64),
      address: clipColumn(row.address, 1000),
      stopped: row.stopped ? 1 : 0,
      accessstatus: clipColumn(row.accessstatus, 32),
      pubts: clipColumn(row.pubts, 40),
      detailLoaded: row.detailLoaded ? 1 : 0,
      detailError: clipColumn(row.detailError, 1000),
      payloadJson: JSON.stringify(row.payload || {}),
    };
  }

  const mergeSql = `
    MERGE dbo.vendors AS target
    USING (
      SELECT vendor_id, code, name, simplename, helpcode, org_name, vendorclass_name,
             creditcode, contactphone, address, stopped, accessstatus, pubts,
             detail_loaded, detail_error, payload
      FROM OPENJSON(@payload) WITH (
        vendor_id NVARCHAR(64) '$.vendorId',
        code NVARCHAR(128) '$.code',
        name NVARCHAR(500) '$.name',
        simplename NVARCHAR(256) '$.simplename',
        helpcode NVARCHAR(128) '$.helpcode',
        org_name NVARCHAR(256) '$.orgName',
        vendorclass_name NVARCHAR(256) '$.vendorclassName',
        creditcode NVARCHAR(64) '$.creditcode',
        contactphone NVARCHAR(64) '$.contactphone',
        address NVARCHAR(1000) '$.address',
        stopped BIT '$.stopped',
        accessstatus NVARCHAR(32) '$.accessstatus',
        pubts NVARCHAR(40) '$.pubts',
        detail_loaded BIT '$.detailLoaded',
        detail_error NVARCHAR(1000) '$.detailError',
        payload NVARCHAR(MAX) '$.payloadJson'
      )
    ) AS source
    ON target.vendor_id = source.vendor_id
    WHEN MATCHED THEN UPDATE SET
      code = source.code,
      name = source.name,
      simplename = source.simplename,
      helpcode = source.helpcode,
      org_name = source.org_name,
      vendorclass_name = source.vendorclass_name,
      creditcode = source.creditcode,
      contactphone = source.contactphone,
      address = source.address,
      stopped = source.stopped,
      accessstatus = source.accessstatus,
      pubts = source.pubts,
      detail_loaded = source.detail_loaded,
      detail_error = source.detail_error,
      payload = source.payload,
      synced_at = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (
      vendor_id, code, name, simplename, helpcode, org_name, vendorclass_name,
      creditcode, contactphone, address, stopped, accessstatus, pubts,
      detail_loaded, detail_error, payload, synced_at
    ) VALUES (
      source.vendor_id, source.code, source.name, source.simplename, source.helpcode,
      source.org_name, source.vendorclass_name, source.creditcode, source.contactphone,
      source.address, source.stopped, source.accessstatus, source.pubts,
      source.detail_loaded, source.detail_error, source.payload, SYSUTCDATETIME()
    );
  `;

  return {
    driver: "mssql",
    describe() {
      return `SQL Server ${config.mssql.server}:${config.mssql.port}/${config.mssql.database}`;
    },
    async init() {
      const statements = [
        `IF OBJECT_ID(N'dbo.vendors', N'U') IS NULL
         CREATE TABLE dbo.vendors (
           vendor_id NVARCHAR(64) NOT NULL PRIMARY KEY,
           code NVARCHAR(128) NULL,
           name NVARCHAR(500) NULL,
           simplename NVARCHAR(256) NULL,
           helpcode NVARCHAR(128) NULL,
           org_name NVARCHAR(256) NULL,
           vendorclass_name NVARCHAR(256) NULL,
           creditcode NVARCHAR(64) NULL,
           contactphone NVARCHAR(64) NULL,
           address NVARCHAR(1000) NULL,
           stopped BIT NOT NULL CONSTRAINT DF_vendors_stopped DEFAULT 0,
           accessstatus NVARCHAR(32) NULL,
           pubts NVARCHAR(40) NULL,
           detail_loaded BIT NOT NULL CONSTRAINT DF_vendors_detail DEFAULT 0,
           detail_error NVARCHAR(1000) NULL,
           payload NVARCHAR(MAX) NOT NULL,
           synced_at DATETIME2 NOT NULL
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_vendors_code' AND object_id = OBJECT_ID(N'dbo.vendors'))
         CREATE INDEX idx_vendors_code ON dbo.vendors(code)`,
        `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_vendors_name' AND object_id = OBJECT_ID(N'dbo.vendors'))
         CREATE INDEX idx_vendors_name ON dbo.vendors(name)`,
        `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_vendors_stopped' AND object_id = OBJECT_ID(N'dbo.vendors'))
         CREATE INDEX idx_vendors_stopped ON dbo.vendors(stopped)`,
        `IF OBJECT_ID(N'dbo.app_settings', N'U') IS NULL
         CREATE TABLE dbo.app_settings (
           id INT NOT NULL PRIMARY KEY,
           gateway_host NVARCHAR(300) NOT NULL,
           app_key NVARCHAR(200) NOT NULL,
           app_secret NVARCHAR(200) NOT NULL,
           page_size INT NOT NULL,
           enrich_detail BIT NOT NULL,
           org NVARCHAR(200) NOT NULL,
           vendor_org NVARCHAR(200) NOT NULL,
           updated_at DATETIME2 NOT NULL
         )`,
        `IF OBJECT_ID(N'dbo.sync_state', N'U') IS NULL
         CREATE TABLE dbo.sync_state (
           state_key NVARCHAR(64) NOT NULL PRIMARY KEY,
           state_value NVARCHAR(MAX) NULL
         )`,
        `IF OBJECT_ID(N'dbo.sync_runs', N'U') IS NULL
         CREATE TABLE dbo.sync_runs (
           id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
           mode NVARCHAR(20) NOT NULL,
           status NVARCHAR(20) NOT NULL,
           started_at DATETIME2 NOT NULL,
           finished_at DATETIME2 NULL,
           fetched INT NOT NULL CONSTRAINT DF_sync_runs_fetched DEFAULT 0,
           upserted INT NOT NULL CONSTRAINT DF_sync_runs_upserted DEFAULT 0,
           removed INT NOT NULL CONSTRAINT DF_sync_runs_removed DEFAULT 0,
           message NVARCHAR(MAX) NULL
         )`,
      ];
      for (const statement of statements) {
        await request().query(statement);
      }
      const existing = await request().query("SELECT id FROM dbo.app_settings WHERE id = 1");
      if (!existing.recordset.length) {
        const seed = seedFromEnv();
        await request()
          .input("gateway_host", mssql.NVarChar(300), seed.gatewayHost)
          .input("app_key", mssql.NVarChar(200), seed.appKey)
          .input("app_secret", mssql.NVarChar(200), seed.appSecret)
          .input("page_size", mssql.Int, seed.pageSize)
          .input("enrich_detail", mssql.Bit, seed.enrichDetail ? 1 : 0)
          .input("org", mssql.NVarChar(200), seed.org)
          .input("vendor_org", mssql.NVarChar(200), seed.vendorOrg)
          .input("updated_at", mssql.DateTime2, new Date())
          .query(`
            INSERT INTO dbo.app_settings (
              id, gateway_host, app_key, app_secret, page_size, enrich_detail, org, vendor_org, updated_at
            ) VALUES (1, @gateway_host, @app_key, @app_secret, @page_size, @enrich_detail, @org, @vendor_org, @updated_at)
          `);
      }
    },
    async close() {
      await pool.close();
    },
    async getSettings() {
      const result = await request().query("SELECT * FROM dbo.app_settings WHERE id = 1");
      return mapSettings(result.recordset[0]);
    },
    async saveSettings(input) {
      const current = mapSettings((await request().query("SELECT * FROM dbo.app_settings WHERE id = 1")).recordset[0]);
      const next = mergeDraft(current, input);
      await request()
        .input("gateway_host", mssql.NVarChar(300), next.gatewayHost)
        .input("app_key", mssql.NVarChar(200), next.appKey)
        .input("app_secret", mssql.NVarChar(200), next.appSecret)
        .input("page_size", mssql.Int, next.pageSize)
        .input("enrich_detail", mssql.Bit, next.enrichDetail ? 1 : 0)
        .input("org", mssql.NVarChar(200), next.org)
        .input("vendor_org", mssql.NVarChar(200), next.vendorOrg)
        .input("updated_at", mssql.DateTime2, new Date())
        .query(`
          UPDATE dbo.app_settings SET
            gateway_host = @gateway_host, app_key = @app_key, app_secret = @app_secret,
            page_size = @page_size, enrich_detail = @enrich_detail, org = @org,
            vendor_org = @vendor_org, updated_at = @updated_at
          WHERE id = 1
        `);
      return next;
    },
    async getState(key) {
      const result = await request().input("state_key", mssql.NVarChar(64), key).query(
        "SELECT state_value FROM dbo.sync_state WHERE state_key = @state_key",
      );
      return result.recordset[0]?.state_value || "";
    },
    async setState(key, value) {
      await request()
        .input("state_key", mssql.NVarChar(64), key)
        .input("state_value", mssql.NVarChar(mssql.MAX), value == null ? "" : String(value))
        .query(`
          UPDATE dbo.sync_state SET state_value = @state_value WHERE state_key = @state_key;
          IF @@ROWCOUNT = 0
          INSERT INTO dbo.sync_state (state_key, state_value) VALUES (@state_key, @state_value);
        `);
    },
    async startRun(mode) {
      const result = await request()
        .input("mode", mssql.NVarChar(20), mode)
        .input("started_at", mssql.DateTime2, new Date())
        .query(`
          INSERT INTO dbo.sync_runs (mode, status, started_at, fetched, upserted, removed, message)
          OUTPUT INSERTED.id
          VALUES (@mode, N'running', @started_at, 0, 0, 0, N'');
        `);
      return Number(result.recordset[0].id);
    },
    async finishRun(id, result) {
      await request()
        .input("id", mssql.Int, id)
        .input("status", mssql.NVarChar(20), result.status)
        .input("finished_at", mssql.DateTime2, new Date())
        .input("fetched", mssql.Int, result.fetched || 0)
        .input("upserted", mssql.Int, result.upserted || 0)
        .input("removed", mssql.Int, result.removed || 0)
        .input("message", mssql.NVarChar(mssql.MAX), clipMessage(result.message))
        .query(`
          UPDATE dbo.sync_runs SET
            status = @status, finished_at = @finished_at, fetched = @fetched,
            upserted = @upserted, removed = @removed, message = @message
          WHERE id = @id
        `);
    },
    async listRuns() {
      const result = await request().query(`
        SELECT TOP 20 id, mode, status, started_at, finished_at, fetched, upserted, removed, message
        FROM dbo.sync_runs ORDER BY id DESC
      `);
      return result.recordset.map((row) => ({
        id: row.id,
        mode: row.mode,
        status: row.status,
        startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
        finishedAt: row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at || "",
        fetched: row.fetched,
        upserted: row.upserted,
        removed: row.removed,
        message: row.message || "",
      }));
    },
    async upsertMany(rows) {
      if (!rows.length) return 0;
      const unique = [];
      const seen = new Set();
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const id = rows[index]?.vendorId == null ? "" : String(rows[index].vendorId);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        unique.push(rows[index]);
      }
      unique.reverse();
      const chunks = [];
      let chunk = [];
      let bytes = 0;
      for (const row of unique) {
        const item = openJsonVendor(row);
        const size = (item.payloadJson?.length || 0) + 400;
        if (chunk.length && (chunk.length >= 25 || bytes + size > 120000)) {
          chunks.push(chunk);
          chunk = [];
          bytes = 0;
        }
        chunk.push(item);
        bytes += size;
      }
      if (chunk.length) chunks.push(chunk);
      for (let index = 0; index < chunks.length; index += 1) {
        if (index > 0 && index % 8 === 0) {
          try {
            await reconnect();
          } catch (error) {
            console.warn(`[store] 定期重连失败：${error.message}`);
          }
        }
        const payload = JSON.stringify(chunks[index]);
        await withPool(async () => {
          await request()
            .input("payload", mssql.NVarChar(mssql.MAX), payload)
            .query(mergeSql);
        });
      }
      return unique.length;
    },
    async retainOnly(ids) {
      const keep = [...new Set(ids.map((id) => (id == null ? "" : String(id))).filter(Boolean))];
      if (!keep.length) return 0;
      return withPool(async () => {
        const deleted = await request()
          .input("ids", mssql.NVarChar(mssql.MAX), JSON.stringify(keep))
          .query(`
            DELETE v
            FROM dbo.vendors AS v
            WHERE NOT EXISTS (
              SELECT 1 FROM OPENJSON(@ids) AS ids WHERE ids.[value] = v.vendor_id
            );
          `);
        return deleted.rowsAffected?.[0] || 0;
      });
    },
    async listVendorStamps() {
      const result = await request().query("SELECT vendor_id, pubts, detail_loaded FROM dbo.vendors");
      return result.recordset.map((row) => ({
        vendorId: String(row.vendor_id),
        pubts: row.pubts || "",
        detailLoaded: Boolean(row.detail_loaded),
      }));
    },
    async countVendors(filter) {
      const req = request();
      const where = bindFilter(req, filter);
      const result = await req.query(`SELECT COUNT(*) AS total FROM dbo.vendors ${where}`);
      return Number(result.recordset[0]?.total || 0);
    },
    async queryVendors(filter) {
      const pageInfo = paging(filter);
      const countRequest = request();
      const where = bindFilter(countRequest, filter);
      const total = Number((await countRequest.query(`SELECT COUNT(*) AS total FROM dbo.vendors ${where}`)).recordset[0]?.total || 0);
      const listRequest = request();
      const listWhere = bindFilter(listRequest, filter);
      listRequest.input("offset", mssql.Int, pageInfo.offset);
      listRequest.input("limit", mssql.Int, pageInfo.pageSize);
      const columns = filter.includePayload
        ? "*"
        : `vendor_id, code, name, simplename, helpcode, org_name, vendorclass_name, creditcode,
           contactphone, address, stopped, accessstatus, pubts, detail_loaded, detail_error, synced_at`;
      const result = await listRequest.query(`
        SELECT ${columns} FROM dbo.vendors ${listWhere}
        ORDER BY code, vendor_id
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);
      return {
        total,
        page: pageInfo.page,
        pageSize: pageInfo.pageSize,
        items: result.recordset.map((row) => mapVendor({ ...row, payload: row.payload || "{}" })),
      };
    },
    async getVendor(vendorId) {
      const result = await request()
        .input("vendor_id", mssql.NVarChar(64), vendorId)
        .query("SELECT * FROM dbo.vendors WHERE vendor_id = @vendor_id");
      return mapVendor(result.recordset[0]);
    },
    async listVendorsForExport(filter) {
      const req = request();
      const where = bindFilter(req, filter);
      const result = await req.query(`SELECT * FROM dbo.vendors ${where} ORDER BY code, vendor_id`);
      return result.recordset.map((row) => mapVendor(row));
    },
  };
}
