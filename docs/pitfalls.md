# 踩过的坑

做后台时碰到的、下次还会碰到的事。

## 规格和用词

- **「token」在不用的词里，后台却要用。** 用词表禁的是给用户看的界面；后台是给运营者的，它的设计（`product/admin.md`）自己就写了「用了多少 token」。`tests/words.test.ts` 只放行这一个词，注释里写了原因。其余照旧：「搜索」不用，写「查找」；「设置」不作入口名，写「配置」。
- **官网的叫法是中文的，还和导出的表格绑在一起。** 报名表里各个代码（`readwise`、`wechat-mp`……）的中文叫法照抄官网 `worker.js` 的 `LABELS`，表格的列名也照抄；`tests/waitlist.test.ts` 在旁边有 site 仓库时会比对。这些中文放在 `src/i18n/labels.ts`，因为「组件里不许有中文」的检查不看 `i18n/`。英文界面另有一份译名，下载的表格不分语言，一律用官网那套中文。
- **状态看核心，不看 `invited_at`。** 报名的状态是拿邮箱去对核心的邀请名单算出来的；报名表里的 `invited_at` 只是记个时间。撤回邀请时把它清掉了，账户被删（邀请随之撤回）时没法清，这时状态是「新报名」，表格里却还留着旧的邀请时间。
- **后台里唯一的金色是品牌标志里的那颗圆点。** 标志和 favicon 是从品牌资源原样拷来的文件（`public/icons/mark-*.svg`、`favicon.svg`、`public/favicon.ico`），不改色、不手改；显示高度小于 28 像素时用 `mark-small-*`。后台自己的界面仍然不用金色。`tests/colours.test.ts` 按 sha256 核对这几个文件没被动过，核对标志里的金色只出现一次、就是那颗圆点，其余地方（`--ke-gold` 这个名字、它的色值）一处都不许有。品牌文件更新时要同时更新测试里的 sha256。
- **「七个入口」是六个页面加「退出」。** 用户详情不是入口。
- **圆角只有一套，来自色表（spec `e139a47`）：** 标记 0、标签 8、输入框和小块 14（`--ke-radius`）、卡片 20、弹层 28（`--ke-radius-sheet`，手机上只圆上面两角）、按钮和分段开关是胶囊（`--ke-radius-control`）。后台没有卡片，所以 `--ke-radius-card` 在样式表里还没用到。换色表时，端到端里写死的 `rgb(…)`（`pages.spec.ts` 的页面底色、标题色、用量条的颜色）和 `tests/colours.test.ts` 里的色值清单要一起改；`e2e/radius.spec.ts` 在真浏览器里核对圆角的计算值。后台里的按钮和输入框现在仍是 40 px 高（`.btn.small` 32、表格里 28）：色表说「手指按的地方不矮于 44 px」，`product/admin.md` 没有重复这条，所以这次没动高度。

## Worker 和 wrangler

- **静态文件默认不经过 Worker。** 要给页面加 Content-Security-Policy 这些头，`[assets]` 里得写 `run_worker_first = true`，再由 Worker 调 `env.ASSETS.fetch()`。
- **`--var` 能带冒号。** `wrangler dev --var CORE_URL:http://127.0.0.1:8822` 只按第一个冒号分。本机的口令和密钥就这样传，不用 `.dev.vars` 文件。
- **本机的 `cf-connecting-ip` 是客户端说了算。** `wrangler dev` 不改这个头，所以限速的测试可以给自己安一个地址（每个测试项目一个，免得互相锁住）。线上这个头由 Cloudflare 填，客户端改不了。
- **限速的行和官网的共用一张表。** `attempts.ip_hash` 存 `admin:` 加哈希；官网存的是纯十六进制，撞不上。登录成功时顺手删掉一天前的 `admin:` 行。
- **`Secure` 的 cookie 在 `http://127.0.0.1` 上照样能用。** Chromium 把本机地址当安全来源，Playwright 的请求上下文也是。所以本机不需要另一套 cookie 属性。
- **严格的 CSP 下，条形图的宽度不能写在 HTML 的 `style` 属性里。** Preact 的 `style={{ width }}` 是经 DOM 设的，不算内联样式，`style-src 'self'` 不拦。端到端测试里收集了浏览器的报错来保证这一点。
- **`crypto.subtle.verify` 的参数类型。** 新版 TypeScript 里 `Uint8Array` 默认是 `Uint8Array<ArrayBufferLike>`，传给 Web Crypto 会报类型错；解码函数的返回类型要写成 `Uint8Array<ArrayBuffer>`。
- **Worker 的类型没有装 `@cloudflare/workers-types`。** 它和 DOM 的类型放在同一个 tsconfig 里会打架。`src/worker.ts` 自己写了用到的那几个接口（D1 的 `prepare/bind/first/all/run/batch`、`fetch`）。

## 测试

- **假核心每个测试前重置，报名数据库不重置。** 本地的 D1 只在 `dev/start.mjs` 启动时重建。因为状态看核心，重置假核心之后名单的状态就回到初始；`invited_at` 会留着上一个测试写的时间，所以测试只断言它「有」或「没有」。
- **「拷贝和 spec 一致」的检查只在旁边有 spec 和 site 仓库时才跑。** `tests/words.test.ts` 里那条把 `design/` 里的四个文件和 `../spec`、`../site` 里的原件逐字比；CI 里旁边没有这两个仓库，所以不跑。本机旁边有 spec 的话，spec 的用词表比后台这份新时它会红（`terms.md`、`glossary.md`），和色表无关。色表单独拷（`git show <提交>:design/tokens.css`），用词表另开一次 `npm run sync:spec`，不要混在一个改动里。
- **端到端每次都起新的服务**（`reuseExistingServer: false`）：8821 上已经有 `npm run dev` 在跑的话要先停掉。
- **一个区域别起两个同名的名字。** `<section aria-labelledby>` 和里面可横向滚动的表格容器（`role="region"`）用了同一个名字，按名字找区域时会找到两个。section 上的名字去掉了。
- **停本机的服务按端口或进程号停。** 这台机器上别的仓库也在跑 `wrangler dev`，`pkill -f "wrangler dev"` 会把它们一起停掉。
- **base64url 的最后一个字符有多余的位。** 32 字节的签名编成 43 个字符，最后一个字符只有 4 位有用，换成另外几个字符解出来还是同样的字节。测「改了签名就拒绝」时改的正好是最后一个字符，于是时过时不过。现在校验时要求签名只有一种写法（解码再编码要和原样相同），测试改第一个字符，并把最后一个字符的 63 种别的写法都试一遍。
