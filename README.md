# 供应商档案

把用友 YonSuite 的供应商档案同步到公司自己的数据库，在网页里查询全部字段，并导出 Excel。新增、删除留到下一步。

## 为什么先落到自己的库

用友列表接口要分页，详情还要按供应商再请求一次。页面如果每次打开都打开放平台，会慢，也受令牌和频率限制。本地库负责查询和导出；用友仍是主数据。全量同步对齐全部供应商，增量同步按 `pubts` 时间戳只拉变更。

当前这一步包含：

- 启用、停用供应商都拉取，同一供应商在多个组织的适用范围会合并成一条
- 列表里的全部字段原样保存；可选再调详情接口，补银行账户、联系人等子表
- 网页查询、查看全部字段、按当前筛选导出 Excel
- 手动增量，或每天固定小时自动增量

还没有做：粘贴文字识别后新增供应商，以及删除时同步删除用友（已被单据使用则只提示）。

## 准备用友开放平台

1. 用 YonSuite 管理员进入开放平台，创建自建应用。
2. 在 API 授权里勾选「供应商档案列表查询」。若要银行、联系人等子表，再授权供应商档案详情查询。
3. 记下 AppKey、AppSecret，以及数据中心域名。常见是 `https://c1.yonyoucloud.com`、`c2`、`c3`、`c4`，沙箱多为 `https://dbox.yonyoucloud.com`。只填根地址，不要带 `/iuap-api-gateway`。
4. 个别租户不传组织会查空或报错。组织 ID 按开放平台示例填写，例如 `[666666]`，填到页面的「管理组织 ID / 使用组织 ID」。

调用方式与用友自建应用规范一致：用 AppSecret 对 `appKey` 和毫秒时间戳做 HmacSHA256 签名，换取两小时有效的 `access_token`，再请求：

- `POST /iuap-api-gateway/yonbip/digitalModel/vendor/list`
- `GET /iuap-api-gateway/yonbip/digitalModel/vendor/detail?id=供应商ID`

详情路径或方法如果和租户文档不一致，用环境变量 `YONSUITE_DETAIL_PATH`、`YONSUITE_DETAIL_METHOD` 调整。详情失败时，列表已经返回的字段仍会保存。

## 配置数据库

复制环境变量文件：

```bash
cp .env.example .env
```

默认可以先用 `DB_DRIVER=sqlite`。当前这套环境连的是公司 SQL Server 库 `ai_dev`：

- 公网：`202.101.1.182:15333`
- 公司内网：`126.202.202.246:1433`

用友数据中心是 `https://c3.yonyoucloud.com`。AppKey、AppSecret 和数据库密码只放在本机 `.env`，不要提交到仓库。程序部署在公司内网时，把 `MSSQL_SERVER` 改成 `126.202.202.246`，`MSSQL_PORT` 改成 `1433`。

```bash
DB_DRIVER=mssql
MSSQL_SERVER=202.101.1.182
MSSQL_PORT=15333
MSSQL_DATABASE=ai_dev
MSSQL_USER=sa
MSSQL_PASSWORD=请填写
MSSQL_ENCRYPT=true
MSSQL_TRUST_CERT=true
YONSUITE_HOST=https://c3.yonyoucloud.com
```

库 `ai_dev` 要事先存在。`vendors`、`app_settings`、`sync_runs`、`sync_state` 会在启动时自动创建。供应商的索引列用于搜索，接口返回的完整 JSON 存在 `payload` 里，所以自定义项和后来新增的字段也不会丢。用友供应商 ID 超过 JavaScript 安全整数，程序会按字符串保存，避免详情接口因 ID 被截断而查不到。

每天自动增量（服务器本地时间，建议 `TZ=Asia/Shanghai`）：

```bash
SYNC_DAILY_HOUR=2
```

留空则只在页面上手工同步。每个自然日只自动跑一次。

## 启动

需要 Node.js 22 或以上。

```bash
npm install
npm start
```

浏览器打开 `http://localhost:3000`。

1. 进入「连接设置」，填写数据中心地址、AppKey、AppSecret，保存后点「测试连接」。
2. 回到「查询」，点「全量同步」。
3. 搜索、按启用/停用筛选。点一行，或点「全部字段」，查看该供应商的全部字段、联系人、银行账户和原始 JSON。
4. 「导出 Excel」导出的是当前筛选结果，工作表包括供应商、联系人、银行账户、地址、适用范围。
5. 之后用「增量同步」按上次水位拉取变更。全量同步如果发现用友里已经没有的供应商，会从本地删掉；如果用友异常返回 0 条，则保留本地数据。

AppSecret 只写在数据库里，设置接口不会再把完整密钥返回给浏览器。这个页面给内网使用，不要暴露到公网。

## 检查

```bash
npm test
```
