# 踩过的坑

做后台时碰到的、下次还会碰到的事。

## 规格和用词

- **「token」在不用的词里，后台却要用。** 用词表禁的是给用户看的界面；后台是给运营者的，它的设计（`product/admin.md`）自己就写了「用了多少 token」。`tests/words.test.ts` 只放行这一个词，注释里写了原因。其余照旧：「搜索」不用，写「查找」；「设置」不作入口名，写「配置」。
- **官网的叫法是中文的，还和导出的表格绑在一起。** 报名表里各个代码（`readwise`、`wechat-mp`……）的中文叫法照抄官网 `worker.js` 的 `LABELS`，表格的列名也照抄；`tests/waitlist.test.ts` 在旁边有 site 仓库时会比对。这些中文放在 `src/i18n/labels.ts`，因为「组件里不许有中文」的检查不看 `i18n/`。英文界面另有一份译名，下载的表格不分语言，一律用官网那套中文。
- **状态看核心，不看 `invited_at`。** 报名的状态是拿邮箱去对核心的邀请名单算出来的；报名表里的 `invited_at` 只是记个时间。撤回邀请时把它清掉了，账户被删（邀请随之撤回）时没法清，这时状态是「新报名」，表格里却还留着旧的邀请时间。
- **后台里唯一的金色是品牌标志里的那颗圆点。** 标志和 favicon 是从品牌资源原样拷来的文件（`public/icons/mark-*.svg`、`favicon.svg`、`public/favicon.ico`），不改色、不手改；显示高度小于 28 像素时用 `mark-small-*`。后台自己的界面仍然不用金色。`tests/colours.test.ts` 按 sha256 核对这几个文件没被动过，核对标志里的金色只出现一次、就是那颗圆点，其余地方（`--ke-gold` 这个名字、它的色值）一处都不许有。品牌文件更新时要同时更新测试里的 sha256。
- **「七个入口」是六个页面加「退出」。** 用户详情不是入口。

## Worker 和 wrangler

- **静态文件默认不经过 Worker。** 要给页面加 Content-Security-Policy 这些头，`[assets]` 里得写 `run_worker_first = true`，再由 Worker 调 `env.ASSETS.fetch()`。
- **`--var` 能带冒号。** `wrangler dev --var CORE_URL:http://127.0.0.1:8822` 只按第一个冒号分。本机的口令和密钥就这样传，不用 `.dev.vars` 文件。
- **本机的 `cf-connecting-ip` 是客户端说了算。** `wrangler dev` 不改这个头，所以限速的测试可以给自己安一个地址（每个测试项目一个，免得互相锁住）。线上这个头由 Cloudflare 填，客户端改不了。
- **限速的行和官网的共用一张表。** `attempts.ip_hash` 存 `admin:` 加哈希；官网存的是纯十六进制，撞不上。登录成功时顺手删掉一天前的 `admin:` 行。
- **`Secure` 的 cookie 在 `http://127.0.0.1` 上照样能用。** Chromium 把本机地址当安全来源，Playwright 的请求上下文也是。所以本机不需要另一套 cookie 属性。
- **严格的 CSP 下，条形图的宽度不能写在 HTML 的 `style` 属性里。** Preact 的 `style={{ width }}` 是经 DOM 设的，不算内联样式，`style-src 'self'` 不拦。端到端测试里收集了浏览器的报错来保证这一点。
- **`crypto.subtle.verify` 的参数类型。** 新版 TypeScript 里 `Uint8Array` 默认是 `Uint8Array<ArrayBufferLike>`，传给 Web Crypto 会报类型错；解码函数的返回类型要写成 `Uint8Array<ArrayBuffer>`。
- **Worker 的类型没有装 `@cloudflare/workers-types`。** 它和 DOM 的类型放在同一个 tsconfig 里会打架。`src/worker.ts` 自己写了用到的那几个接口（D1 的 `prepare/bind/first/all/run/batch`、`fetch`）。

- **报名表的语言叫 `zh-Hans`，核心叫 `zh`。** 邀请通知要按报名时的页面语言发，后台交给核心的是核心的名字：`zh-Hans`（和以 `zh-` 开头的）换成 `zh`，`en`（和 `en-` 开头的）换成 `en`，别的不交，核心用缺省的英文。同一个邮箱有几行报名时用最新的一行。`tests/waitlist.test.ts` 的 `mailLanguages` 有测试。
- **「失败」要按原因分开显示，认不出的按「结果未知」。** 核心给的原因是固定的几个值（`refused`、`error`、`unconfirmed`）；`unconfirmed` 的意思是信可能已经发出，所以不写「撤回再邀请」的建议，改写「再邀请可能让对方收到第二封」。核心将来加了新的原因、或者一个失败没带原因时，后台按 `unconfirmed` 显示，不当成确定失败。端到端里用假核心的 `invite_mail` 钩子摆出各种状态，`old_core` 钩子摆出还没有这两个字段的旧核心（列表照常显示，邀请通知那一列是「—」）。

- **从报名名单邀请后说什么，看核心返回的 `added` / `already`，不看提交了几个。** 两位管理员各开一页、第一位已经邀请了同一个人，第二位那页（没刷新）仍显示「邀请」按钮；核心对已有的地址什么都不动、也不再请求发信，返回 `already`。如果只按提交 1 个就说「请求了一封邀请通知」，是误报。`src/shared/waitlist.ts` 的 `inviteNote` 选句子：在 `added` 里 → `waitlist.done_one`，在 `already` 里 → `waitlist.done_one_already`，都不在（`invalid`，或答复没提到它）→ 既有的 `invites.add_invalid`，按失败显示。地址按去空格、小写比较，和名单一致。多人仍用 `waitlist.done_many` 的计数。英文 `done_many` 不分单复数，写成「标签: 数字」，因为 `{s:n}` 套不上 people/person、was/were。

## 测试

- **两个窗口的测试，先等旧窗口的名单渲染出来，再在另一个窗口操作。** 名单是页面 load 之后才取的；`goto` 返回时旧窗口可能还没拿到数据，等它拿到时已经是操作之后的新状态，就不是「旧名单」了（手机项目上偶尔复现）。先断言旧窗口里那几行是「新」，再动手；这样旧窗口里的「邀请」按钮和复选框才是真的旧。
- **假核心每个测试前重置，报名数据库不重置。** 本地的 D1 只在 `dev/start.mjs` 启动时重建。因为状态看核心，重置假核心之后名单的状态就回到初始；`invited_at` 会留着上一个测试写的时间，所以测试只断言它「有」或「没有」。
- **端到端每次都起新的服务**（`reuseExistingServer: false`）：8821 上已经有 `npm run dev` 在跑的话要先停掉。
- **一个区域别起两个同名的名字。** `<section aria-labelledby>` 和里面可横向滚动的表格容器（`role="region"`）用了同一个名字，按名字找区域时会找到两个。section 上的名字去掉了。
- **停本机的服务按端口或进程号停。** 这台机器上别的仓库也在跑 `wrangler dev`，`pkill -f "wrangler dev"` 会把它们一起停掉。
- **base64url 的最后一个字符有多余的位。** 32 字节的签名编成 43 个字符，最后一个字符只有 4 位有用，换成另外几个字符解出来还是同样的字节。测「改了签名就拒绝」时改的正好是最后一个字符，于是时过时不过。现在校验时要求签名只有一种写法（解码再编码要和原样相同），测试改第一个字符，并把最后一个字符的 63 种别的写法都试一遍。
