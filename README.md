# YonSuite 供应商数据中心

第一阶段实现 YonSuite 供应商全量拉取、SQL Server 本地存储、查询展示和 Excel 导出。项目默认启用演示模式，便于在尚未填写生产凭据时验收界面。

## 启动

```bash
npm install
cp .env.example .env
npm run dev
```

打开 <http://localhost:3000>。将 `.env` 中 `DEMO_MODE` 改为 `false` 后，应用会使用真实 YonSuite 和 SQL Server 配置；密钥文件已被 Git 忽略。

## 配置说明

1. 将附件中的 API 根地址、供应商查询路径、令牌（或应用凭据）填入 `YONSUITE_*`。
2. 将 SQL Server 地址、库名和账号填入 `DB_*`。数据库须预先创建，首次同步会自动建立 `dbo.Suppliers` 表。
3. 点击“同步数据”执行全量分页拉取和幂等写入；同一供应商再次同步时会更新原记录。

> 当前工作区未包含用户提到的 `API信息.md`，因此仓库仅提供安全的占位配置，未写入任何真实凭据。不同 YonSuite 租户的鉴权头、字段及响应结构如与当前适配器不同，请按附件内容调整 `src/yonsuite.js`。

## 后续阶段建议

- 使用 Windows 任务计划程序、SQL Server Agent 或容器定时任务每日调用 `POST /api/sync`，并按 YonSuite 更新时间实现增量游标。
- 新增“文本识别预览 → 人工确认 → YonSuite 新增”的两段式流程，避免模型误识别直接写入业务系统。
- 删除前调用 YonSuite 引用检查接口；存在业务单据引用时只展示服务端返回原因，禁止本地先删。
