# LabHub Cloudflare Serverless 全托管部署与无缝迁移指南

本指南指导如何将课题组协作平台（LabHub）**彻底脱离对物理服务器的依赖**，完整迁移到 Cloudflare 全托管 Serverless 架构，实现 **100% 永久零成本、免运维、全公网高速直连**。

---

## 架构升级对比

| 维度 | 原物理服务器方案 | Cloudflare 全托管 Serverless 方案 |
| :--- | :--- | :--- |
| **服务器成本** | 需常开物理机/云服务器，电费与机器损耗 | **￥0 / 永久免费**（运行在 Cloudflare Free Plan） |
| **物理依赖** | 强依赖单台机器，断网/断电即瘫痪 | **零物理依赖**，全球 300+ 边缘数据中心全天候容灾 |
| **访问方式** | 需内网穿透 / VPN / 本地端口转发 | **全球 CDN 域名直连**（如 `https://labhub.pages.dev`），自动配置 HTTPS |
| **数据库** | 本地单个 `labhub.db` SQLite 文件 | **Cloudflare D1**（基于 SQLite 语法的分布式边缘关系数据库） |
| **附件存储** | 本地磁盘目录 | **Cloudflare R2**（兼容 S3 的高可用对象存储，免流量费） |
| **单文件限制** | 本地文件读写受机器限制 | **支持 15MB 大文件**（PPT、PDF 讲义、文献、高清头像） |
| **冷启动延迟** | Python 进程需占用 200MB+ 内存 | **TypeScript + Hono 轻量运行时**，冷启动 < 1ms |
| **数据保留** | 原有账号、文献、排期与资料 | **100% 完整保留**，密码无缝兼容登录（bcryptjs） |

---

## 免费额度与课题组容量核算

| 服务组件 | Cloudflare 免费版月度额度 | 30 人课题组月度预估消耗 | 额度使用率 |
| :--- | :--- | :--- | :--- |
| **Cloudflare Pages** | **无限请求数**、无限流量 | ~50,000 次静态资源加载 | **< 1%**（无限额） |
| **Pages Functions** | **100,000 次请求/天**（约 300 万次/月） | ~12,000 次 API 请求/月 | **< 0.4%** |
| **Cloudflare D1** | **500 万行读取/天**，10 万行写入/天 | ~20,000 行读取/天，~500 行写入/天 | **< 0.5%** |
| **Cloudflare R2** | **10 GB 存储**，每月 1,000 万次读取，**0 流量费** | ~2 GB 附件资料，每月 ~5,000 次读取 | **~20%**（永久免费） |

> 结论：对于 30 人左右的学术课题组，日常打卡、组会排期、文献分享、资料下载等操作，消耗不到 Cloudflare 免费配额的 1%，**终身无需支付任何费用**。

---

## 5 分钟极简上线流程

### 前置准备
在你的终端中安装并验证 Node.js (>= 18)：
```bash
node -v
```

---

### 第一步：登录 Cloudflare 账号
在终端运行登录命令（会自动打开浏览器进行一次性授权）：
```bash
npx wrangler login
```

---

### 第二步：创建云端数据库 D1 与附件存储桶 R2

1. 进入 `frontend` 目录：
   ```bash
   cd frontend
   ```

2. **创建 D1 数据库**：
   ```bash
   npx wrangler d1 create labhub-db
   ```
   终端会输出如下信息：
   ```json
   [[d1_databases]]
   binding = "DB"
   database_name = "labhub-db"
   database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   ```
   👉 **请将输出中的 `database_id` 复制并替换到 `frontend/wrangler.json` 中的 `database_id` 字段**。

3. **创建 R2 存储桶**（用于存储 15MB 附件与头像）：
   ```bash
   npx wrangler r2 bucket create labhub-files
   ```

---

### 第三步：一键导入数据表结构与现有所有历史数据

我们已经为你准备好了完整的建表脚本与历史数据导出脚本：

1. **导入数据库结构（DDL + 索引）**：
   ```bash
   npx wrangler d1 execute labhub-db --remote --file=../scripts/schema_d1.sql
   ```

2. **导入课题组所有历史数据（账号、文献、排期、教材、偏好等）**：
   ```bash
   npx wrangler d1 execute labhub-db --remote --file=../scripts/data_d1.sql
   ```

> 验证：终端会输出 `users (5 rows)`, `library_papers (7 rows)`, `seminar_schedules (3 rows)` 等成功导入提示。

---

### 第四步：打包前端并一键部署至 Cloudflare Pages

在 `frontend` 目录下运行：
```bash
npm run build
npm run pages:deploy
```
如果是首次部署，终端会提示确认项目名称，直接回车确认（默认 `labhub`）。

部署完成后，终端会立即给出一个全球可访问的 HTTPS 网址，例如：
```text
✨ Deployment complete! Take a peek over at https://labhub.pages.dev
```

打开该网址，现有所有账号即可直接输入原密码登录使用！

---

## 进阶配置：绑定课题组自定义域名（可选）

如果你有课题组的独立域名（例如 `lab.yourdomain.org`）：
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)；
2. 点击左侧 **Workers & Pages** -> 选择 **labhub** 项目；
3. 点击 **Custom domains**（自定义域）选项卡；
4. 点击 **Set up a domain**，输入你的域名，Cloudflare 会全自动配置全球 Anycast CDN 与免费 SSL/TLS 证书（秒级生效）。

---

## 本地开发与离线联调

如果后续需要进行本地新功能开发与调试：
```bash
cd frontend
# 启动包含本地 D1 与 R2 模拟环境的 Pages 服务
npm run pages:dev
```
本地访问 `http://localhost:8788` 即可进行完全一致的测试。

---

## 数据定期备份方法

Cloudflare D1 具备每日自动快照功能，你也可以在本地随时执行以下命令导出备份：
```bash
npx wrangler d1 backup create labhub-db
```
或直接将数据库导出为本地 SQL 文件：
```bash
npx wrangler d1 export labhub-db --remote --output=./backup_$(date +%Y%m%d).sql
```
