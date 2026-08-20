# Discourse Monitor Worker / Discourse 监控 Worker

[English](#english) | [中文](#中文)

---

## English

A serverless Discourse topic monitor running on Cloudflare Workers. It periodically checks each configured Discourse `latest.json` endpoint and sends notifications for new topics through Bark and/or Gotify.

### Features

- Monitor multiple Discourse forums through their `latest.json` endpoints
- Scheduled checks with Cloudflare Cron Triggers (default: every 5 minutes)
- Bark and Gotify notifications
- First synchronization records the latest topic ID without sending historical notifications
- Web management console for forum, notification endpoint, and schedule configuration
- Username/password-protected console with signed, secure session cookies
- Cloudflare D1 persistence for settings, monitor state, and Bark clients
- Quiet hours evaluated in the `Asia/Shanghai` timezone
- Manual check and topic ID synchronization actions

### Prerequisites

- A Cloudflare account with Workers and D1 enabled
- Node.js 20 or later
- A Discourse forum endpoint such as `https://forum.example.com/latest.json`
- Optional: Bark and/or Gotify notification service

### Deployment

1. Clone the repository and install dependencies:

   ```bash
   git clone git@github.com:WuBarlynn/discourse-monitor-worker.git
   cd discourse-monitor-worker
   npm install
   ```

2. Authenticate Wrangler with Cloudflare:

   ```bash
   npx wrangler login
   ```

3. Create a D1 database:

   ```bash
   npx wrangler d1 create discourse-monitor
   ```

4. Copy the returned `database_id` into `wrangler.toml`:

   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "discourse-monitor"
   database_id = "YOUR_DATABASE_ID"
   ```

5. Apply database migrations:

   ```bash
   npx wrangler d1 migrations apply discourse-monitor --remote
   ```

6. Set the required Worker secrets. Each command opens a secure prompt:

   ```bash
   npx wrangler secret put ADMIN_USERNAME
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SESSION_SECRET
   ```

   Generate a secure value for `SESSION_SECRET`, for example:

   ```bash
   openssl rand -base64 48
   ```

7. Deploy the Worker:

   ```bash
   npx wrangler deploy
   ```

8. Open the Worker URL printed by Wrangler, sign in, and configure forums and notification endpoints from the console.

### Configuration

The Worker is scheduled every five minutes by default:

```toml
[triggers]
crons = ["*/5 * * * *"]
```

Change this value in `wrangler.toml` and run `npx wrangler deploy` again to update the schedule. The console's check interval determines whether an individual forum is skipped during a Cron invocation; its minimum value is 60 seconds, but the effective scheduling precision is constrained by the Cron expression.

### Local development

```bash
npm run dev
```

For a production-like local D1 database, apply migrations without `--remote` before starting the development server:

```bash
npx wrangler d1 migrations apply discourse-monitor
npm run dev
```

Local development also requires secret values. Add them to `.dev.vars` (this file is ignored by Git):

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD=use-a-strong-password
SESSION_SECRET=use-a-long-random-secret
```

### Security notes

- Set a unique, strong `ADMIN_PASSWORD` and a long random `SESSION_SECRET`.
- Bark keys and Gotify settings are stored in D1. Restrict management-console access and use Cloudflare Access or similar protection if appropriate.
- Do not commit `.dev.vars`, `.env`, credentials, or Worker secrets.

---

## 中文

一个运行在 Cloudflare Workers 上的无服务器 Discourse 新帖监控工具。它会定期检查已配置论坛的 `latest.json` 接口，并通过 Bark 和/或 Gotify 推送新主题通知。

### 功能

- 通过 Discourse `latest.json` 接口监听多个论坛
- 使用 Cloudflare Cron Trigger 定时检查（默认每 5 分钟）
- 支持 Bark 与 Gotify 推送
- 首次同步时仅记录最新主题 ID，不推送历史主题
- 提供 Web 管理控制台，可管理论坛、推送终端和检查配置
- 管理控制台使用用户名、密码和签名安全 Cookie 保护
- 使用 Cloudflare D1 保存配置、监控状态和 Bark 接收设备
- 免打扰时段按 `Asia/Shanghai` 时区计算
- 支持手动检查和一键同步主题 ID

### 前置条件

- 已启用 Workers 与 D1 的 Cloudflare 账号
- Node.js 20 或更高版本
- 可访问的 Discourse 接口地址，例如 `https://forum.example.com/latest.json`
- 可选：Bark 和/或 Gotify 推送服务

### 部署

1. 克隆仓库并安装依赖：

   ```bash
   git clone git@github.com:WuBarlynn/discourse-monitor-worker.git
   cd discourse-monitor-worker
   npm install
   ```

2. 登录 Cloudflare：

   ```bash
   npx wrangler login
   ```

3. 创建 D1 数据库：

   ```bash
   npx wrangler d1 create discourse-monitor
   ```

4. 将命令输出中的 `database_id` 填入 `wrangler.toml`：

   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "discourse-monitor"
   database_id = "替换为实际的数据库 ID"
   ```

5. 初始化远程 D1 数据库：

   ```bash
   npx wrangler d1 migrations apply discourse-monitor --remote
   ```

6. 设置必需的 Worker Secret。每条命令都会打开安全输入提示：

   ```bash
   npx wrangler secret put ADMIN_USERNAME
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SESSION_SECRET
   ```

   可使用以下命令生成 `SESSION_SECRET`：

   ```bash
   openssl rand -base64 48
   ```

7. 部署 Worker：

   ```bash
   npx wrangler deploy
   ```

8. 打开 Wrangler 输出的 Worker 地址，使用设置的管理员账号登录，然后在控制台添加论坛和推送配置。

### 配置说明

默认 Cron 调度为每五分钟一次：

```toml
[triggers]
crons = ["*/5 * * * *"]
```

修改 `wrangler.toml` 后执行 `npx wrangler deploy` 即可更新调度。管理控制台的“检查间隔”用于决定某个论坛在本次 Cron 执行时是否跳过；最小可设为 60 秒，但实际检查精度受 Cron 表达式限制。

### 本地开发

```bash
npm run dev
```

如需使用接近生产环境的本地 D1 数据库，可先执行本地迁移：

```bash
npx wrangler d1 migrations apply discourse-monitor
npm run dev
```

本地运行也需要 Secret。请创建 `.dev.vars` 文件（该文件已被 Git 忽略）：

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请使用高强度密码
SESSION_SECRET=请使用足够长的随机字符串
```

### 安全提示

- 请设置唯一的高强度 `ADMIN_PASSWORD` 和足够长的随机 `SESSION_SECRET`。
- Bark Key 和 Gotify 配置保存在 D1 中。请限制管理控制台访问；如有需要，可结合 Cloudflare Access 等额外访问控制。
- 不要提交 `.dev.vars`、`.env`、凭据或任何 Worker Secret。
