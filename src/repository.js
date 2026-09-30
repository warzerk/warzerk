import sql from 'mssql';
import { config } from './config.js';

let pool;
async function getPool() {
  if (!pool) pool = await sql.connect(config.database);
  return pool;
}

export async function ensureSchema() {
  const db = await getPool();
  await db.request().query(`
    IF OBJECT_ID('dbo.Suppliers', 'U') IS NULL
    CREATE TABLE dbo.Suppliers (
      Id NVARCHAR(100) NOT NULL PRIMARY KEY, Code NVARCHAR(100), Name NVARCHAR(500),
      Status NVARCHAR(100), Category NVARCHAR(300), Contact NVARCHAR(200), Phone NVARCHAR(100),
      TaxNumber NVARCHAR(100), Address NVARCHAR(1000), UpdatedAt NVARCHAR(100),
      RawJson NVARCHAR(MAX) NOT NULL, SyncedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);
}

export async function upsertSuppliers(items) {
  await ensureSchema();
  const db = await getPool();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    for (const item of items) {
      const request = new sql.Request(tx);
      const values = { id: item.id || item.code, code: item.code, name: item.name, status: item.status, category: item.category, contact: item.contact, phone: item.phone, tax: item.taxNumber, address: item.address, updated: item.updatedAt, raw: JSON.stringify(item.raw) };
      for (const [key, value] of Object.entries(values)) request.input(key, sql.NVarChar(sql.MAX), String(value ?? ''));
      await request.query(`MERGE dbo.Suppliers AS t USING (SELECT @id AS Id) AS s ON t.Id=s.Id
        WHEN MATCHED THEN UPDATE SET Code=@code,Name=@name,Status=@status,Category=@category,Contact=@contact,Phone=@phone,TaxNumber=@tax,Address=@address,UpdatedAt=@updated,RawJson=@raw,SyncedAt=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (Id,Code,Name,Status,Category,Contact,Phone,TaxNumber,Address,UpdatedAt,RawJson) VALUES (@id,@code,@name,@status,@category,@contact,@phone,@tax,@address,@updated,@raw);`);
    }
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
}

export async function listSuppliers({ search = '', status = '', page = 1, pageSize = 20 }) {
  await ensureSchema();
  const db = await getPool();
  const request = db.request().input('search', sql.NVarChar, `%${search}%`).input('status', sql.NVarChar, status).input('offset', sql.Int, (page - 1) * pageSize).input('limit', sql.Int, pageSize);
  const result = await request.query(`SELECT *, COUNT(*) OVER() AS TotalCount FROM dbo.Suppliers WHERE (@status='' OR Status=@status) AND (@search='' OR Name LIKE @search OR Code LIKE @search OR Contact LIKE @search OR TaxNumber LIKE @search) ORDER BY SyncedAt DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  return { items: result.recordset.map(r => ({ id:r.Id,code:r.Code,name:r.Name,status:r.Status,category:r.Category,contact:r.Contact,phone:r.Phone,taxNumber:r.TaxNumber,address:r.Address,updatedAt:r.UpdatedAt,raw:JSON.parse(r.RawJson) })), total: result.recordset[0]?.TotalCount || 0 };
}
