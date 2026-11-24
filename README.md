# KeepEssence admin

KeepEssence 的管理后台：给运营者（部署这套服务的人）用，官方部署在 `admin.keepessence.app`。用户看不到它。
The KeepEssence management portal: invitations, accounts, usage and the audit log, for the operator of a deployment.

状态：做完了，在本机对着假核心用真浏览器验过（桌面和手机两种视口）。还没部署，也还没对着真核心跑过，见下面「没验的」。

设计在 spec 仓库的 `product/admin.md`；它用的核心接口在 core 仓库的 `docs/admin-api.md`。

## 它做什么

| 页面 | 内容 | 动作 |
|---|---|---|
| 概览 | 报名、已邀请、已加入的人数；账户数、近 7 天活跃、已停用；今天和近 7 天的存入、解读、每日摘要、笔记；等初筛和等解读的条数；内置助手的用量；定时任务上一次什么时候跑的；模型、发信、通知有没有配好 | 无 |
| 报名名单 | 落地页的内测报名，每人的回答和状态（新报名、已邀请、已加入） | 按状态和页面语言筛选、查找、邀请一个或勾选多个一起邀请、下载表格 |
| 邀请 | 邀请名单：邮箱、邀请时间、加入时间 | 加一个或粘贴一批邮箱、撤回还没加入的邀请、取登录验证码 |
| 用户 | 每个账户：邮箱、状态、加入时间、上次活跃、设备数、助手数、现有条目数、笔记数、占用空间 | 查找、按状态筛选、点开看详情 |
| 用户详情 | 设备、助手、各助手的用量、近 30 天每天的数量 | 停用和恢复、让全部设备退出、撤销单个设备、删除账户 |
| 用量 | 内置助手每天的调用次数和 token（7、30、90 天），用得最多的账户 | 选天数 |
| 记录 | 后台里做过的动作，新的在前 | 无 |

几条规矩：

- **不看内容。** 后台只显示数量、时间、设备和助手的名称。条目、解读、每日摘要、笔记的标题和正文，核心的管理接口本来就不给。
- **会丢东西的事先确认。** 删除账户要输入对方的邮箱，输对之前红色按钮按不了。停用可以恢复，所以不问。
- **每个动作留记录。** 做完一个动作，页面上有一句话说发生了什么，「记录」页里能查到。
- **取登录验证码**只在没配发信服务时出现。验证码只显示一次。要请对方先在登录页点「发验证码」，再把后台取到的验证码给他：顺序反了，对方那一下会让这个验证码作废。
- 界面跟浏览器的语言走（中文、英文），深浅色跟系统走，登录页恒为深色。颜色只取 `design/tokens.css`；后台里不用金色，红色只给删除、停用和出了问题的地方。

## 结构

一个 Worker（`keepessence-admin`）：一段很小的服务端代码，加上一个静态的单页应用。

| 位置 | 内容 |
|---|---|
| `src/worker.ts` | 服务端：登录、会话、`/api/*`。查过会话后再去调核心的管理接口或读报名数据库 |
| `src/shared/` | 服务端和测试共用的纯函数：会话 cookie 的签名和校验、表格的防公式处理、粘贴邮箱的解析、报名状态的计算 |
| `src/` 其余 | 单页应用：Vite + Preact + TypeScript，手写的 CSS |
| `src/i18n/zh.ts`、`en.ts` | 界面上的每一句话，中英各一份。`labels.ts` 是报名表里各个代码的叫法，中文和官网的一致 |
| `design/` | 从 spec 仓库拷来的色表、用词表、词表。不在这里改；`npm run sync:spec` 重新拷 |
| `dev/fake.mjs` | 核心管理接口的内存假实现，照 `admin-api.md` 写的，人和数都是编的 |
| `dev/start.mjs` | 在本机把整套跑起来 |
| `dev/waitlist/` | 官网的报名表结构（拷来的）和一份编的报名名单 |
| `tests/` | 单元检查：会话、表格、邮箱、状态、颜色、用词 |
| `e2e/` | Playwright 端到端：桌面和手机两种视口 |
| `docs/pitfalls.md` | 踩过的坑 |

浏览器只和这个 Worker 说话，只调它自己的 `/api/*`。核心的运营者密钥 `CORE_ADMIN_SECRET` 只在服务端用，不出现在任何应答和静态文件里（端到端测试会查）。

### 登录和会话

- 一个口令。`POST /api/session` 用不提前返回的方式比对口令，对了就发一个 cookie `ke_admin`：内容是「到期时间 + 随机数」加上 HMAC-SHA-256 签名，12 小时到期，`HttpOnly; Secure; SameSite=Strict; Path=/`。服务端不存会话。
- 同一个来源地址 10 分钟内输错 5 次，之后一律回 429，输对了也不行。失败次数记在报名数据库已有的 `attempts` 表里，存的是 `admin:` 加地址的 SHA-256，和官网自己的行不会撞。
- 除了登录本身，`/api/*` 的每个请求都要有效的会话；会改东西的请求还要带 `x-ke-admin: 1` 这个头，别的网站上的表单带不了它。
- 登录、退出、被限速，都记进核心的记录里（`POST /admin/audit`）。记的是地址哈希的前 8 位，不是地址。
- 所有应答带 `X-Robots-Tag: noindex, nofollow`；接口应答带 `Cache-Control: no-store`；页面带严格的 Content-Security-Policy（只许本站，不许内联脚本）。

## 开发

需要 Node 22。

```sh
npm install
npm run dev        # http://127.0.0.1:8821，口令 local-operator-password
```

`npm run dev` 先构建，再做三件事：在 8822 端口起假核心；建一个全新的本地 D1 当报名数据库，灌进官网的表结构和编的名单；用 `wrangler dev` 在 8821 端口跑 Worker。本机用变量 `CORE_URL` 指向假核心，设了它就不走服务绑定。每次启动名单都回到初始状态。

改界面时另开一个终端跑 `npm run dev:app`（http://127.0.0.1:8823，带热更新，`/api` 转给 8821）。

`npm run shots` 给每个页面截图，放在 `screenshots/`（要先有 `npm run dev` 在跑）。

## 测试

```sh
npm run typecheck
npm test           # 单元检查
npm run build
npm run e2e        # 端到端：自己构建、自己起本机的整套，跑完就关
```

端到端测的是：登录（口令不对、连错 5 次被限速、口令对了）、每个页面都显示出数据、从报名名单邀请一个和多个、加邀请和撤回、取验证码、停用和恢复、让设备退出、输入邮箱确认后删除、记录里出现对应的条目、没登录的 `/api/*` 请求被拒、运营者密钥不出现在任何应答和构建出的文件里。

对着部署好的后台查一遍（只看不改，唯一的痕迹是记录里多一次登录和退出）：

```sh
KE_ADMIN_URL=https://admin.example.com KE_ADMIN_PASSWORD=… npm run e2e
```

## 部署

前提：核心（`keepessence-core`）已经部署，并且设了 `ADMIN_SECRET`，它的管理接口（`/admin/…`）才会打开；官网的报名数据库（D1，`keepessence-waitlist`）已经建好。两者和这个 Worker 在同一个 Cloudflare 账户下。

1. 改 `wrangler.toml`：
   - `routes` 里的域名换成你自己的（这个域名的 zone 要在你的账户里）。
   - `[[d1_databases]]` 的 `database_id` 换成你的报名数据库的 id（`wrangler d1 list` 能看到）。没有官网、也没有报名名单的话，建一个空库，把 `dev/waitlist/0001_waitlist.sql` 灌进去：登录限速要用里面的 `attempts` 表。
   - `[[services]]` 的 `service` 是核心那个 Worker 的名字。
2. 设三个密钥：

   ```sh
   npx wrangler secret put ADMIN_PASSWORD      # 运营者口令，自己定，够长
   npx wrangler secret put SESSION_KEY         # 给会话 cookie 签名的随机串，例如 openssl rand -base64 48 的输出
   npx wrangler secret put CORE_ADMIN_SECRET   # 和核心的 ADMIN_SECRET 一样
   ```

   第一次 `secret put` 时 Worker 还不存在，wrangler 会问要不要先建一个，答是。
3. 构建并部署：

   ```sh
   npm ci
   npm run build
   npx wrangler deploy
   ```

   `wrangler deploy` 会按 `routes` 把自定义域名接上。
4. 打开域名，用口令登录。概览里看得到数字、定时任务不是红的，就是通了。也可以跑上面那条「对着部署好的后台查一遍」。

换口令：重新 `secret put ADMIN_PASSWORD`。让所有已登录的会话立刻失效：换 `SESSION_KEY`。不要设 `CORE_URL`，它只给本机开发用。

## 没验的

- 没有部署过，没有对着真核心跑过。核心的管理接口写这个后台时还在实现中，这里照 `admin-api.md` 做；`e2e/online.spec.ts` 是给部署之后用的。
- 只在 Chromium 里验过（桌面和 Pixel 7 的视口），没有在真手机、Safari、Firefox 上看过。
- 只有一个口令，没有多个运营者和权限之分（设计里写了以后再说）。

## 许可

AGPL-3.0-only，见 `LICENSE`。
