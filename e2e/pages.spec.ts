// Every page shows its data.
import { expect, test } from "@playwright/test";
import { isPhone, reset, row, setFake, signIn } from "./helpers";

test.beforeEach(async ({ request }) => reset(request));

test("the seven entries: a left rail on wide screens, a menu at the top on phones", async ({ page }, info) => {
  await signIn(page);
  const entries = page.locator(".nav-entry");
  const menu = page.getByRole("button", { name: "菜单" });
  if (isPhone(info)) {
    await expect(entries.first()).toBeHidden();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    // The bar sits at the top of the screen.
    expect((await page.locator(".nav").boundingBox())!.y).toBe(0);
  } else {
    await expect(menu).toBeHidden();
    const box = (await page.locator(".nav").boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.width).toBeLessThan(260);
    expect(box.height).toBeGreaterThan(800);
  }
  await expect(entries).toHaveText(["概览", "报名名单", "邀请", "用户", "用量", "记录", "退出"]);
  await expect(page.locator('.nav-entry[aria-current="page"]')).toHaveText("概览");

  for (const [entry, path, title] of [["waitlist", "/waitlist", "报名名单"], ["invites", "/invites", "邀请"], ["users", "/users", "用户"], ["usage", "/usage", "用量"], ["audit", "/audit", "记录"], ["overview", "/", "概览"]]) {
    if (isPhone(info) && (await menu.getAttribute("aria-expanded")) === "false") await menu.click();
    await page.locator(`[data-entry="${entry}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.locator('.nav-entry[aria-current="page"]')).toHaveText(title);
    // Choosing an entry closes the menu on a phone.
    if (isPhone(info)) await expect(menu).toHaveAttribute("aria-expanded", "false");
  }
});

test("nothing on any page is wider than the screen, and the browser reports no error", async ({ page }) => {
  // A blocked inline style or script (the Content-Security-Policy) would show up here.
  await signIn(page);
  // From here on (the session check before signing in is a 401, which the browser logs).
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));
  for (const to of ["/", "/waitlist", "/invites", "/users", "/users/usr_0001", "/usage", "/audit"]) {
    await page.goto(to);
    await expect(page.locator("main table").first()).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, to).toBeLessThanOrEqual(0);
  }
  await page.goto("/usage");
  await expect(page.locator(".bar > div").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("overview: the counts, the jobs' last runs, and what is configured", async ({ page, request }) => {
  await signIn(page);
  const stats = async (testid: string) => page.getByTestId(testid).locator(".stat").evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
  await expect(page.getByTestId("waitlist-counts").locator(".stat")).toHaveCount(3);
  expect(await stats("waitlist-counts")).toEqual(["10 报名", "4 已邀请", "2 已加入"]);
  expect((await stats("account-counts")).map((x) => x.replace(/^[\d,]+ /, ""))).toEqual(["账户", "近 7 天活跃", "已停用", "邀请名单", "还没加入"]);
  expect((await stats("account-counts"))[2]).toBe("2 已停用");
  await expect(page.getByTestId("account-counts")).toContainText("64");
  await expect(page.getByTestId("account-counts")).toContainText("68");

  const counts = page.getByRole("region", { name: "数量" });
  await expect(counts.locator("tbody tr")).toHaveCount(4);
  await expect(counts.locator("tbody tr").nth(0)).toContainText("存入");
  await expect(counts.locator("tbody tr").nth(0)).toContainText("412");
  await expect(counts.locator("tbody tr").nth(1)).toContainText("388");
  await expect(counts.locator("tbody tr").nth(2)).toContainText("173");
  await expect(page.locator("main")).toContainText("等初筛");
  await expect(page.locator("main")).toContainText("等解读");
  await expect(page.getByRole("region", { name: "内置助手的用量" }).locator("tbody tr")).toHaveText([/调用次数/, /输入 token/, /输出 token/]);

  // The minute job ran a minute or two ago: plain words, nothing red.
  const minute = page.getByTestId("cron-minute");
  await expect(minute).toContainText(/上一次：[12]\s?分钟前/);
  await expect(minute.locator(".state")).toHaveAttribute("data-dot", "solid");
  await expect(minute.locator(".state")).not.toHaveClass(/bad/);
  await expect(page.getByTestId("cron-hourly")).toContainText("上一次：25分钟前");
  await expect(page.getByRole("alert")).toHaveCount(0);

  const config = page.getByTestId("config");
  await expect(config.locator('[data-config="model"]')).toContainText("配好了");
  await expect(config.locator('[data-config="model"]')).toContainText("claude-haiku-5-5");
  await expect(config.locator('[data-config="mail"]')).toContainText("没配");
  await expect(config.locator('[data-config="mail"] .state')).toHaveAttribute("data-dot", "ring");
  await expect(config.locator('[data-config="push"]')).toContainText("配好了");
  await expect(config.locator('[data-config="version"]')).toContainText("1.4.2-fake");

  // Ten minutes exactly is not late; more than ten is, and only then is anything red.
  await setFake(request, { minute_ago_s: 9 * 60 + 30 });
  await page.reload();
  await expect(page.getByTestId("cron-minute")).toContainText("上一次：9分钟前");
  await expect(page.getByTestId("cron-minute").locator(".state")).not.toHaveClass(/bad/);

  await setFake(request, { minute_ago_s: 11 * 60, mail_configured: true });
  await page.reload();
  await expect(page.getByTestId("cron-minute")).toContainText("上一次：11分钟前");
  await expect(page.getByTestId("cron-minute").locator(".state")).toHaveClass(/bad/);
  await expect(page.getByTestId("cron-minute").locator(".state")).toHaveAttribute("data-dot", "danger");
  await expect(page.getByRole("alert")).toHaveText("每分钟的定时任务超过 10 分钟没跑了。");
  await expect(page.getByTestId("cron-hourly").locator(".state")).not.toHaveClass(/bad/);
  await expect(page.getByTestId("config").locator('[data-config="mail"]')).toContainText("配好了");

  await setFake(request, { minute_ago_s: null });
  await page.reload();
  await expect(page.getByTestId("cron-minute")).toContainText("还没跑过");
  await expect(page.getByTestId("cron-minute").locator(".state")).toHaveClass(/bad/);
});

test("waitlist: every sign-up with its answers and status, newest first", async ({ page }) => {
  await signIn(page, "/waitlist");
  await expect(page.getByTestId("waitlist-summary")).toHaveText("共 10 人 · 新报名 6 · 已邀请 2 · 已加入 2");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(10);
  expect(await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-email")))).toEqual([
    "new.ada@example.com", "new.bo@example.com", "new.chen@example.com", "new.dana@example.com", "new.emil@example.com", "new.fang@example.com",
    "invited.lin@example.com", "invited.omar@example.com", "joined.mei@example.com", "joined.sam@example.com",
  ]);
  const bo = row(page, "new.bo@example.com");
  for (const text of ["新报名", "中文", "微信文件传输助手、其他：备忘录", "微信公众号、小红书", "ChatGPT", "用系统自带的", "存了从来不看。", "2026年11月24日"]) await expect(bo).toContainText(text);
  await expect(row(page, "invited.lin@example.com")).toHaveAttribute("data-status", "invited");
  await expect(row(page, "invited.lin@example.com")).toContainText("已邀请");
  await expect(row(page, "joined.mei@example.com")).toContainText("已加入");
  // Only a new sign-up can be ticked or invited; a joined one links to its account.
  await expect(row(page, "invited.lin@example.com").locator("input, button")).toHaveCount(0);
  await expect(row(page, "joined.sam@example.com").locator("a")).toHaveAttribute("href", "/users/usr_0003");
  // A note that looks like a formula is shown as plain text.
  await expect(row(page, "new.dana@example.com")).toContainText('=HYPERLINK("https://example.com","click")');
  await expect(page.locator("main a[href^='https://example.com']")).toHaveCount(0);
});

test("waitlist: filter by status and page language, find, select several", async ({ page }) => {
  await signIn(page, "/waitlist");
  const rows = page.locator("tbody tr");
  const status = page.getByLabel("按状态筛选");
  const lang = page.getByLabel("按页面语言筛选");
  const find = page.getByLabel("查找");

  await status.selectOption("invited");
  await expect(rows).toHaveCount(2);
  await status.selectOption("joined");
  await expect(rows).toHaveCount(2);
  await status.selectOption("new");
  await expect(rows).toHaveCount(6);
  await lang.selectOption("zh-Hans");
  await expect(rows).toHaveCount(3);
  await lang.selectOption("en");
  await expect(rows).toHaveCount(3);
  await status.selectOption("");
  await expect(rows).toHaveCount(5);
  await lang.selectOption("");

  await find.fill("OMAR");
  await expect(rows).toHaveCount(1);
  await find.fill("小红书");
  await expect(rows).toHaveCount(2);
  await find.fill("nobody at all");
  await expect(page.locator("main")).toContainText("没有符合的报名。");
  await find.fill("");
  await expect(rows).toHaveCount(10);

  // Ticking: the button counts what is ticked among the rows listed.
  const button = page.getByTestId("invite-selected");
  await expect(button).toBeDisabled();
  await lang.selectOption("zh-Hans");
  await page.getByLabel("选中列出的全部新报名").check();
  await expect(button).toHaveText("邀请选中的 3 人");
  await page.getByLabel("选中 new.fang@example.com").uncheck();
  await expect(button).toHaveText("邀请选中的 2 人");
  await lang.selectOption("en");
  await expect(button).toHaveText("邀请选中的 0 人");
  await expect(button).toBeDisabled();
});

test("waitlist: the download has the site's columns and guards formulas", async ({ page }) => {
  await signIn(page, "/waitlist");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "下载表格" }).click()]);
  expect(download.suggestedFilename()).toBe("keepessence-enrolled.csv");
  const fs = await import("node:fs");
  const csv = fs.readFileSync(await download.path(), "utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const lines = csv.slice(1).trimEnd().split("\r\n");
  expect(lines).toHaveLength(11);
  expect(lines[0]).toBe('"报名时间(UTC)","邮箱","页面","东西堆在哪儿","从哪里收集","常用助手","想用的方式","最头疼的","邀请时间"');
  expect(lines[1]).toContain('"2026-11-24T09:12:00.000Z","new.ada@example.com","英文","Readwise、浏览器标签页"');
  expect(lines[4]).toContain(`"'=HYPERLINK(""https://example.com"",""click"")"`);
  const res = await page.request.get("/api/waitlist.csv");
  expect(res.headers()["content-type"]).toBe("text/csv; charset=utf-8");
  expect(res.headers()["content-disposition"]).toContain("attachment");
});

test("invitations: the list with invited and joined times", async ({ page }) => {
  await signIn(page, "/invites");
  await expect(page.locator("tbody tr")).toHaveCount(68);
  // Newest first: the four that have not joined were invited last.
  expect(await page.locator("tbody tr").evaluateAll((els) => els.slice(0, 4).map((el) => el.getAttribute("data-email")))).toEqual([
    "invited.lin@example.com", "invited.omar@example.com", "pending.kai@example.com", "pending.ines@example.com",
  ]);
  const pending = row(page, "pending.kai@example.com");
  await expect(pending).toContainText("还没加入");
  await expect(pending.getByRole("button", { name: "撤回" })).toBeVisible();
  await expect(pending.getByRole("button", { name: "取登录验证码" })).toBeVisible();
  const joined = row(page, "reader@example.com");
  await expect(joined).toContainText(/2026年11月\d+日/);
  await expect(joined.getByRole("button", { name: "撤回" })).toHaveCount(0);
  await expect(joined.locator("a")).toHaveAttribute("href", "/users/usr_0001");
  await expect(page.getByTestId("mail-note")).toHaveText("没配发信服务：邀请之后，在这里取登录验证码转给对方。");
});

test("users: the table, find, the status filter and paging", async ({ page }) => {
  await signIn(page, "/users");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(50);
  await expect(page.locator("thead th")).toHaveText(["邮箱", "状态", "加入时间", "上次活跃", "设备", "助手", "现有条目", "笔记", "占用空间"]);
  const reader = page.locator('tr[data-user="usr_0001"]');
  await expect(rows.first()).toHaveAttribute("data-user", "usr_0001");
  await expect(reader).toContainText("reader@example.com");
  await expect(reader).toContainText("正常");
  await expect(reader).toContainText("700 MB");
  await expect(reader.locator("td").nth(4)).toHaveText("3");

  const more = page.getByRole("button", { name: "显示更多" });
  await more.click();
  await expect(rows).toHaveCount(64);
  await expect(more).toHaveCount(0);

  await page.getByLabel("按状态筛选").selectOption("suspended");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("已停用");
  await expect(rows.first().locator(".state")).toHaveClass(/bad/);
  await page.getByLabel("按状态筛选").selectOption("active");
  await expect(rows).toHaveCount(50);
  await page.getByLabel("按状态筛选").selectOption("");

  await page.getByLabel("查找").fill("joined.");
  await expect(rows).toHaveCount(2);
  await page.getByLabel("查找").fill("nobody-here");
  await expect(page.locator("main")).toContainText("没有符合的账户。");
  await page.getByLabel("查找").fill("reader");
  await expect(rows).toHaveCount(1);
  await rows.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/users\/usr_0001$/);
  await expect(page.getByTestId("user-email")).toHaveText("reader@example.com");
});

test("user detail: devices, assistants, 30 days of counts, usage per assistant", async ({ page }) => {
  await signIn(page, "/users/usr_0001");
  await expect(page.getByTestId("user-email")).toHaveText("reader@example.com");
  await expect(page.getByTestId("user-status")).toHaveText("正常");
  await expect(page.locator("main")).toContainText("占用空间 700 MB");

  const devices = page.getByRole("region", { name: "设备" });
  await expect(devices.locator("thead th")).toHaveText(["名称", "种类", "档位", "上次使用", "通知", "动作"]);
  await expect(devices.locator("tbody tr")).toHaveCount(3);
  await expect(devices.locator("tbody tr").first()).toContainText("管理");
  await expect(devices.getByRole("button", { name: "撤销" })).toHaveCount(3);

  const assistants = page.getByRole("region", { name: "助手", exact: true });
  await expect(assistants.locator("tbody tr")).toHaveCount(1);
  await expect(assistants.locator("tbody tr").first()).toContainText("内置助手");
  await expect(assistants.locator("tbody tr").first()).toContainText("定时型");
  await expect(assistants.locator("tbody tr").first()).toContainText("初筛 · 解读 · 每日摘要");

  await expect(page.getByTestId("user-days").locator("tr")).toHaveCount(30);
  await expect(page.getByRole("region", { name: "近 30 天每天的数量" }).locator("thead th")).toHaveText(["日期", "存入", "解读", "每日摘要", "笔记"]);
  // Usage includes the hidden dispatch assistant, which the assistant list leaves out.
  await expect(page.getByRole("region", { name: "各助手的用量（近 30 天）" }).locator("tbody tr")).toHaveCount(2);

  for (const name of ["停用", "让全部设备退出", "删除账户"]) await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  // Red is for suspend and delete only.
  await expect(page.getByRole("button", { name: "停用", exact: true })).toHaveClass(/danger/);
  await expect(page.getByRole("button", { name: "删除账户", exact: true })).toHaveClass(/danger/);
  await expect(page.getByRole("button", { name: "让全部设备退出" })).not.toHaveClass(/danger/);

  // An account with a second, connected assistant.
  await page.goto("/users/usr_0003");
  await expect(page.getByRole("region", { name: "助手", exact: true }).locator("tbody tr")).toHaveCount(2);
  await expect(page.getByRole("region", { name: "助手", exact: true })).toContainText("对话型");

  await page.goto("/users/usr_nobody");
  await expect(page.getByRole("alert")).toContainText("出错了");
});

test("usage: per day for 7, 30 and 90 days with a plain bar, and the top accounts", async ({ page }) => {
  await signIn(page, "/usage");
  const days = page.getByTestId("usage-days").locator("tr");
  await expect(days).toHaveCount(30);
  await expect(page.getByRole("button", { name: "30 天" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "7 天" }).click();
  await expect(days).toHaveCount(7);
  await page.getByRole("button", { name: "90 天" }).click();
  await expect(days).toHaveCount(90);
  await expect(page.getByRole("region", { name: "内置助手每天的用量" }).locator("thead th")).toHaveText(["日期", "调用次数", "输入 token", "输出 token", "条目", "相对多少"]);

  // The bar is a div whose width follows the day's amount; the longest is the full width.
  const widths = await page.locator(".bar > div").evaluateAll((els) => els.map((el) => (el as HTMLElement).style.width));
  expect(widths).toHaveLength(90);
  expect(widths).toContain("100%");
  expect(new Set(widths).size).toBeGreaterThan(10);
  expect(await page.locator(".bar > div").first().evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^rgb\((11, 11, 11|245, 245, 243)\)$/);
  expect(await page.locator("main svg, main canvas").count()).toBe(0);

  const top = page.getByTestId("usage-top").locator("tr");
  await expect(top).toHaveCount(20);
  await expect(top.first().locator("a")).toHaveAttribute("href", /^\/users\/usr_\d+$/);
});

test("audit log: newest first, paged", async ({ page }) => {
  await signIn(page, "/audit");
  const rows = page.getByTestId("audit-rows").locator("tr");
  await expect(rows).toHaveCount(50);
  await expect(page.locator("thead th")).toHaveText(["时间", "动作", "对象", "说明", "来源"]);
  // This very sign-in is the newest entry.
  await expect(rows.first()).toHaveAttribute("data-action", "portal.sign_in");
  await expect(rows.first()).toContainText("登录后台");
  await expect(rows.first()).toContainText("后台");
  await page.getByRole("button", { name: "显示更多" }).click();
  await expect(rows).toHaveCount(71);
  await expect(page.getByRole("button", { name: "显示更多" })).toHaveCount(0);
});

test.describe("in English", () => {
  test.use({ locale: "en-GB" });
  test("the app follows the browser's language", async ({ page }, info) => {
    await page.goto("/");
    await expect(page.getByLabel("Operator password")).toBeVisible();
    await signIn(page, "/waitlist");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    if (isPhone(info)) await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.locator(".nav-entry")).toHaveText(["Overview", "Waitlist", "Invitations", "Users", "Usage", "Audit log", "Sign out"]);
    await expect(page.getByTestId("waitlist-summary")).toHaveText("10 people · 6 new · 2 invited · 2 joined");
    await expect(row(page, "new.bo@example.com")).toContainText("WeChat File Transfer, Other: 备忘录");
    await page.goto("/");
    await expect(page.getByTestId("cron-minute")).toContainText(/Last run: [12] minutes? ago/);
  });
});

test.describe("dark and light", () => {
  for (const scheme of ["dark", "light"] as const) {
    test(`follows the system: ${scheme}`, async ({ browser }, info) => {
      const context = await browser.newContext({ ...info.project.use, colorScheme: scheme });
      const page = await context.newPage();
      await signIn(page);
      await expect(page.locator("body")).toHaveCSS("background-color", scheme === "dark" ? "rgb(11, 11, 11)" : "rgb(245, 245, 243)");
      await expect(page.locator("h1")).toHaveCSS("color", scheme === "dark" ? "rgb(245, 245, 243)" : "rgb(11, 11, 11)");
      await context.close();
    });
  }
});
