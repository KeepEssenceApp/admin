// What the operator can do, and that each action leaves one sentence and an audit entry.
import { expect, test, type Page } from "@playwright/test";
import { CHANGE, auditEntries, reset, row, said, setFake, signIn } from "./helpers";

test.beforeEach(async ({ request }) => reset(request));

const waitlistRow = async (page: Page, email: string) =>
  ((await (await page.request.get("/api/waitlist")).json()).rows as { email: string; status: string; invited_at: string | null }[]).find((r) => r.email === email)!;

test("invite one person from the waitlist", async ({ page }) => {
  await signIn(page, "/waitlist");
  const ada = row(page, "new.ada@example.com");
  await expect(ada).toHaveAttribute("data-status", "new");
  await ada.getByRole("button", { name: "邀请" }).click();
  await expect(said(page)).toHaveText("已邀请 new.ada@example.com，这个邮箱可以登录了。没有发邮件。");
  await expect(ada).toHaveAttribute("data-status", "invited");
  await expect(ada.locator("input, button")).toHaveCount(0);
  await expect(page.getByTestId("waitlist-summary")).toHaveText("共 10 人 · 新报名 5 · 已邀请 3 · 已加入 2");

  // The core has the invitation, the sign-up row has the time, and the log has both lines.
  const stored = await waitlistRow(page, "new.ada@example.com");
  expect(stored.status).toBe("invited");
  expect(stored.invited_at).not.toBeNull();
  const log = await auditEntries(page, 5);
  expect(log.find((e) => e.action === "waitlist.invite")).toMatchObject({ target: "new.ada@example.com", source: "portal" });
  expect(log.find((e) => e.action === "invite.add")).toMatchObject({ target: "new.ada@example.com", source: "core" });
  // The downloaded file carries the time too.
  expect(await (await page.request.get("/api/waitlist.csv")).text()).toMatch(/"new\.ada@example\.com".*"20\d\d-\d\d-\d\dT[^"]+"\r\n/);

  await page.goto("/invites");
  await expect(row(page, "new.ada@example.com")).toContainText("还没加入");
  await page.goto("/audit");
  await expect(page.locator('tr[data-action="waitlist.invite"]').first()).toContainText("new.ada@example.com");
  await expect(page.locator('tr[data-action="waitlist.invite"]').first()).toContainText("从报名名单邀请");
});

test("select several on the waitlist and invite them together", async ({ page }) => {
  await signIn(page, "/waitlist");
  const three = ["new.bo@example.com", "new.chen@example.com", "new.emil@example.com"];
  for (const email of three) await page.getByLabel(`选中 ${email}`).check();
  const button = page.getByTestId("invite-selected");
  await expect(button).toHaveText("邀请选中的 3 人");
  await button.click();
  await expect(said(page)).toHaveText("已邀请 3 人，另有 0 人本来就在邀请名单里。没有发邮件。");
  for (const email of three) await expect(row(page, email)).toHaveAttribute("data-status", "invited");
  await expect(row(page, "new.dana@example.com")).toHaveAttribute("data-status", "new");
  await expect(page.getByTestId("waitlist-summary")).toHaveText("共 10 人 · 新报名 3 · 已邀请 5 · 已加入 2");
  await expect(button).toBeDisabled();

  const log = await auditEntries(page, 6);
  expect(log.find((e) => e.action === "waitlist.invite")).toMatchObject({ target: "3 emails", detail: "added 3, already invited 0, invalid 0" });
  expect(log.filter((e) => e.action === "invite.add").map((e) => e.target).sort()).toEqual(three);
  expect((await waitlistRow(page, "new.chen@example.com")).invited_at).not.toBeNull();
});

test("only people on the waitlist can be invited from it", async ({ page }) => {
  await signIn(page);
  const res = await page.request.post("/api/waitlist/invite", { data: { emails: ["stranger@example.com"] }, headers: CHANGE });
  expect(res.status()).toBe(400);
  expect((await (await page.request.get("/api/invites")).json()).invites.some((i: { email: string }) => i.email === "stranger@example.com")).toBe(false);
});

test("add one invitation, paste many, and withdraw one that has not joined", async ({ page }) => {
  await signIn(page, "/invites");
  const box = page.locator('textarea[name="emails"]');
  const add = page.getByRole("button", { name: "加入邀请名单" });
  await expect(add).toBeDisabled();

  await box.fill("Solo.Guest@Example.com");
  await add.click();
  await expect(said(page)).toHaveText("加了 1 个，0 个已在名单里，0 个无效。");
  await expect(row(page, "solo.guest@example.com")).toContainText("还没加入");
  await expect(box).toHaveValue("");

  await box.fill("fresh.one@example.com, fresh.two@example.com\ninvited.lin@example.com\nnot-an-email\nfresh.one@example.com；also bad@");
  await add.click();
  await expect(said(page)).toHaveText("加了 2 个，1 个已在名单里，3 个无效。");
  await expect(page.getByTestId("invalid-list")).toHaveText("无效的：not-an-email, also, bad@");
  // What could not be added stays in the box.
  await expect(box).toHaveValue("not-an-email\nalso\nbad@");
  await expect(page.locator("tbody tr")).toHaveCount(71);
  // Newest first.
  expect(await page.locator("tbody tr").evaluateAll((els) => els.slice(0, 3).map((el) => el.getAttribute("data-email")).sort())).toEqual(["fresh.one@example.com", "fresh.two@example.com", "solo.guest@example.com"]);

  await row(page, "fresh.two@example.com").getByRole("button", { name: "撤回" }).click();
  await expect(said(page)).toHaveText("已撤回 fresh.two@example.com 的邀请，这个邮箱不能再登录。");
  await expect(row(page, "fresh.two@example.com")).toHaveCount(0);
  await expect(page.locator("tbody tr")).toHaveCount(70);

  const log = await auditEntries(page, 6);
  expect(log[0]).toMatchObject({ action: "invite.remove", target: "fresh.two@example.com" });
  expect(log.filter((e) => e.action === "invite.add")).toHaveLength(3);
});

test("withdrawing an invitation made from the waitlist makes the sign-up new again", async ({ page }) => {
  await signIn(page, "/invites");
  await row(page, "invited.omar@example.com").getByRole("button", { name: "撤回" }).click();
  await expect(said(page)).toContainText("invited.omar@example.com");
  expect(await waitlistRow(page, "invited.omar@example.com")).toMatchObject({ status: "new", invited_at: null });
  await page.goto("/waitlist");
  await expect(row(page, "invited.omar@example.com")).toHaveAttribute("data-status", "new");
});

test("get a sign-in code: shown once, with its expiry and the order to do things in", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, "/invites");
  await row(page, "invited.lin@example.com").getByRole("button", { name: "取登录验证码" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("aria-label", "invited.lin@example.com 的登录验证码");
  const code = (await page.getByTestId("login-code").innerText()).trim();
  expect(code).toMatch(/^\d{6}$/);
  await expect(dialog).toContainText("请对方先在登录页点「发验证码」，再把这个验证码给他。顺序反了的话，对方那一下会让这个验证码作废。");
  await expect(dialog).toContainText(/\d{2}:\d{2} 前有效。/);
  await expect(dialog).toContainText("只显示这一次，关掉就看不到了。");

  await dialog.getByRole("button", { name: "复制" }).click();
  await expect(dialog.getByRole("status")).toHaveText("已复制。");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);

  await dialog.getByRole("button", { name: "关闭" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(code);
  // The log says a code was made, never the code itself.
  const log = await auditEntries(page, 3);
  expect(log[0]).toMatchObject({ action: "login_code.mint", target: "invited.lin@example.com" });
  expect(JSON.stringify(log)).not.toContain(code);

  // A suspended account gets no code, and a plain sentence says why.
  await row(page, "person07@example.com").getByRole("button", { name: "取登录验证码" }).click();
  await expect(said(page)).toHaveText("这个账户已停用，取不了验证码。");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("when mail is configured the code can still be fetched, for when the mail does not arrive", async ({ page, request }) => {
  await setFake(request, { mail_configured: true });
  await signIn(page, "/invites");
  await expect(page.locator("tbody tr")).toHaveCount(68);
  await expect(page.getByTestId("mail-note")).toHaveText("发信服务配好了：邀请之后会发一封邀请通知，登录验证码也会发到对方的邮箱。对方没收到验证码时，可以在这里取出来转给他。");
  await expect(row(page, "pending.kai@example.com").getByRole("button", { name: "取登录验证码" })).toBeVisible();
  await expect(row(page, "pending.kai@example.com").getByRole("button", { name: "撤回" })).toBeVisible();
});

test("suspend and restore an account", async ({ page }) => {
  await signIn(page, "/users/usr_0001");
  await page.getByRole("button", { name: "停用", exact: true }).click();
  await expect(said(page)).toHaveText("已停用 reader@example.com：全部设备和助手立刻不能用，也不能再登录；数据原样留着。");
  await expect(page.getByTestId("user-status")).toHaveText("已停用");
  await expect(page.getByTestId("user-status").locator(".state")).toHaveClass(/bad/);
  await expect(page.getByRole("button", { name: "停用", exact: true })).toHaveCount(0);
  expect((await (await page.request.get("/api/users/usr_0001")).json()).status).toBe("suspended");
  // Data is kept.
  await expect(page.getByRole("region", { name: "设备" }).locator("tbody tr")).toHaveCount(3);

  await page.getByRole("button", { name: "恢复" }).click();
  await expect(said(page)).toHaveText("已恢复 reader@example.com，设备和助手可以用了。");
  await expect(page.getByTestId("user-status")).toHaveText("正常");
  await expect(page.getByRole("button", { name: "停用", exact: true })).toBeVisible();

  const log = await auditEntries(page, 3);
  expect(log.slice(0, 2).map((e) => [e.action, e.target])).toEqual([["user.restore", "reader@example.com"], ["user.suspend", "reader@example.com"]]);
});

test("revoke one device, then sign out all devices", async ({ page }) => {
  await signIn(page, "/users/usr_0001");
  const devices = page.getByRole("region", { name: "设备" }).locator("tbody tr");
  await expect(devices).toHaveCount(3);
  const name = (await devices.first().locator("td").first().innerText()).trim();
  await devices.first().getByRole("button", { name: "撤销" }).click();
  await expect(said(page)).toHaveText(`已撤销设备「${name}」。`);
  await expect(devices).toHaveCount(2);

  await page.getByRole("button", { name: "让全部设备退出" }).click();
  await expect(said(page)).toHaveText("已让 reader@example.com 的 2 台设备退出，助手没动。他可以再登录。");
  await expect(page.getByTestId("no-devices")).toHaveText("没有设备。");
  await expect(page.getByRole("button", { name: "让全部设备退出" })).toBeDisabled();
  // Assistants are not touched, and the account stays active.
  await expect(page.getByRole("region", { name: "助手", exact: true }).locator("tbody tr")).toHaveCount(1);
  await expect(page.getByTestId("user-status")).toHaveText("正常");

  const log = await auditEntries(page, 3);
  expect(log.slice(0, 2).map((e) => e.action)).toEqual(["user.sign_out", "user.device_revoke"]);
});

test("delete an account: the red button stays off until the email is typed", async ({ page }) => {
  await signIn(page, "/users/usr_0002");
  await expect(page.getByTestId("user-email")).toHaveText("joined.mei@example.com");
  await page.getByRole("button", { name: "删除账户", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "删除账户" });
  await expect(dialog).toContainText("账户和它的全部数据（条目、解读、每日摘要、笔记、附件、设备、助手）一并删除，不能恢复。邀请也一并撤回。");
  const confirm = page.getByTestId("confirm-delete");
  const field = dialog.getByLabel("输入 joined.mei@example.com 确认");
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveClass(/danger/);
  await expect(confirm).toHaveCSS("background-color", "rgb(179, 38, 30)");

  await field.fill("joined.mei@example.co");
  await expect(confirm).toBeDisabled();
  await field.fill("someone.else@example.com");
  await expect(confirm).toBeDisabled();
  // Enter does nothing while it does not match.
  await field.press("Enter");
  await expect(dialog).toBeVisible();
  expect((await page.request.get("/api/users/usr_0002")).status()).toBe(200);

  // Cancel closes it without deleting.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await page.request.get("/api/users/usr_0002")).status()).toBe(200);

  await page.getByRole("button", { name: "删除账户", exact: true }).click();
  await dialog.getByLabel("输入 joined.mei@example.com 确认").fill("joined.mei@example.com");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(said(page)).toHaveText("已删除 joined.mei@example.com 的账户和它的全部数据。");
  await expect(page.locator("main tbody tr").first()).toBeVisible();
  await expect(page.locator('tr[data-user="usr_0002"]')).toHaveCount(0);

  expect((await page.request.get("/api/users/usr_0002")).status()).toBe(404);
  // The invitation went with it, so on the waitlist this person is a new sign-up again.
  expect((await (await page.request.get("/api/invites")).json()).invites.some((i: { email: string }) => i.email === "joined.mei@example.com")).toBe(false);
  expect((await waitlistRow(page, "joined.mei@example.com")).status).toBe("new");
  expect((await auditEntries(page, 3))[0]).toMatchObject({ action: "user.delete", target: "joined.mei@example.com", source: "core" });
  await page.goto("/audit");
  await expect(page.getByTestId("audit-rows").locator("tr").first()).toContainText("删除账户");
  await expect(page.getByTestId("audit-rows").locator("tr").first()).toContainText("joined.mei@example.com");
});

test("the server refuses a delete whose email does not match", async ({ page }) => {
  await signIn(page);
  const res = await page.request.delete("/api/users/usr_0003", { data: { confirm_email: "wrong@example.com" }, headers: CHANGE });
  expect(res.status()).toBe(400);
  expect((await page.request.get("/api/users/usr_0003")).status()).toBe(200);
});

test("the sentence about an action goes away with the page it happened on", async ({ page }) => {
  await signIn(page, "/users/usr_0005");
  await page.getByRole("button", { name: "停用", exact: true }).click();
  await expect(said(page)).toBeVisible();
  await page.locator("main a.back").click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(said(page)).toHaveCount(0);
});
