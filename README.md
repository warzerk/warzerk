# YonSuite 物料查询平台

从用友 YonSuite ERP 拉取销售订单 / 采购订单 / 生产订单 / 库存 / BOM 数据,支持按物料编码联查订单、查询库存明细账与仓库现存量、查询一级 BOM 清单。

## 项目结构

- `backend/` — NestJS + Prisma + PostgreSQL,负责对接 YonSuite OpenAPI、定时同步数据、提供查询接口
- `frontend/` — React + Vite + Ant Design 管理后台

## 本地运行

### 1. 准备 PostgreSQL

```bash
createdb yonsuite_query
```

### 2. 配置后端环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env,填入真实的 DATABASE_URL、JWT_SECRET、YONSUITE_APP_KEY/APP_SECRET/TENANT_ID
```

### 3. 初始化数据库 & 启动后端

```bash
npm install
npx prisma migrate dev
npm run prisma:seed   # 创建默认管理员账号(用户名/密码见下方 seed 脚本环境变量,默认 admin/admin123)
npm run start:dev     # http://localhost:3000/api
```

### 4. 启动前端

```bash
cd ../frontend
npm install
npm run dev            # http://localhost:5173,已配置 /api 代理到后端 3000 端口
```

## 需要你验证的关键假设

这个仓库是在没有真实 YonSuite 接口联调环境的情况下搭建的(沙箱无法访问 `c3.yonyoucloud.com`),以下地方标注了假设,请在真实环境联调时对照实际返回结构核实并调整:

- `backend/src/yonsuite/yonsuite.service.ts` — `getAccessToken` 返回结构、业务接口鉴权方式(access_token/appKey 是走 query 还是 header)、分页参数名
- `backend/src/sync/sync.service.ts` — 各单据的字段路径(单号、组织、物料编码、日期等),已经用 `pick()` 做了多候选字段名兜底,建议先跑一次同步,查看 Postgres 里 `raw` 字段的真实内容,再收窄候选字段
- 库存明细账(出入库流水)对应的 YonSuite 接口还未确认,`inventory_ledger` 表和查询接口已就绪,但同步任务还没接入,需要先找到该接口再补上
- BOM"使用中"的过滤条件(`enableState: 'enable'`)是猜测的字段名,需要核实

## 权限模型

当前版本只做登录墙(JWT),登录后可查看全部数据,没有按人员/部门做数据行级权限隔离。
