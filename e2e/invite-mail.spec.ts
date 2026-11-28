// #106: the invitation list shows the invitation mail as the core reports it, and the portal hands the core each
// person's sign-up language. The mail itself is the core's: nothing here sends anything.
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { CHANGE, FAKE, reset, row, said, setFake, signIn } from "./helpers";

test.beforeEach(async ({ request }) => reset(request));

const cell = (page: import("@playwright/test").Page, email: string) => row(page, email).getByTestId("mail-state");
const requests = async (request: import("@playwright/test").APIRequestContext) => (await (await request.get(`${FAKE}/__test/invite-requests`)).json()) as Record<string, unknown>[];

test("each invitation shows its mail as the core reports it: accepted is not delivered; a refusal can be fixed and invited again; an unknown result may have gone out", async ({ page }) => {
  await signIn(page, "/invites");
  const accepted = cell(page, "invited.lin@example.com");
  await expect(accepted).toHaveAttribute("data-state", "accepted");
  await expect(accepted).toContainText("已受理（不等于送达）");
  await expect(accepted).not.toContainText("已送达");

  const unknown = cell(page, "invited.omar@example.com");
  await expect(unknown).toHaveAttribute("data-reason", "unconfirmed");
  await expect(unknown).toContainText("结果未知：可能已经发出");
  await expect(unknown).toContainText("再邀请可能让对方收到第二封。");
  // No "withdraw and invite again" advice for a result that is unknown.
  await expect(unknown).not.toContainText("撤回再邀请");
  await expect(unknown).not.toContainText("修好配置");

  const refused = cell(page, "pending.kai@example.com");
  await expect(refused).toHaveAttribute("data-reason", "refused");
  await expect(refused).toContainText("失败：发信服务拒绝了");
  await expect(refused).toContainText("修好配置后，可以撤回再邀请。");
  await expect(refused).not.toContainText("第二封");

  await expect(cell(page, "pending.ines@example.com")).toContainText("排队中");
  // Invitations from before the mail existed have none.
  await expect(cell(page, "joined.mei@example.com")).toHaveAttribute("data-state", "none");
  await expect(cell(page, "joined.mei@example.com")).toHaveText("—");
});

test("the other kinds: sending, not sent, a mail that never left, and what the portal does not know counts as unconfirmed", async ({ page, request }) => {
  const at = new Date().toISOString();
  await setFake(request, {
    invite_mail: {
      "pending.kai@example.com": { state: "failed", at, reason: "error" },
      "pending.ines@example.com": { state: "sending", at, reason: null },
      "invited.lin@example.com": { state: "not_sent", at, reason: "no_mail_service" },
      "invited.omar@example.com": { state: "failed", at, reason: "something-new" },
    },
  });
  await signIn(page, "/invites");
  await expect(cell(page, "pending.kai@example.com")).toContainText("失败：没有发出");
  await expect(cell(page, "pending.kai@example.com")).toContainText("修好配置后，可以撤回再邀请。");
  await expect(cell(page, "pending.ines@example.com")).toContainText("发送中");
  await expect(cell(page, "invited.lin@example.com")).toContainText("没发：没配发信服务");
  // A failure whose reason is not known is shown as the unknown result, never as a certain failure.
  await expect(cell(page, "invited.omar@example.com")).toHaveAttribute("data-reason", "unconfirmed");
  await expect(cell(page, "invited.omar@example.com")).toContainText("结果未知：可能已经发出");

  await setFake(request, { invite_mail: { "pending.kai@example.com": { state: "failed", at, reason: null }, "pending.ines@example.com": { state: "teleported", at, reason: null } } });
  await page.reload();
  await expect(cell(page, "pending.kai@example.com")).toHaveAttribute("data-reason", "unconfirmed");
  await expect(cell(page, "pending.ines@example.com")).toContainText("状态：teleported");
});

test("a core from before the mail (no lang, no mail) still lists, with no mail state", async ({ page, request }) => {
  await setFake(request, { old_core: true });
  await signIn(page, "/invites");
  await expect(row(page, "invited.lin@example.com")).toBeVisible();
  await expect(cell(page, "invited.lin@example.com")).toHaveAttribute("data-state", "none");
  await expect(page.getByTestId("said")).toHaveCount(0);
});

test("a new invitation shows as queued when mail is configured, and as not sent when it is not", async ({ page, request }) => {
  await signIn(page, "/invites");
  await page.locator('textarea[name="emails"]').fill("fresh.one@example.com");
  await page.getByRole("button", { name: "加入邀请名单" }).click();
  await expect(cell(page, "fresh.one@example.com")).toContainText("没发：没配发信服务");

  await setFake(request, { mail_configured: true });
  await page.locator('textarea[name="emails"]').fill("fresh.two@example.com");
  await page.getByRole("button", { name: "加入邀请名单" }).click();
  await expect(cell(page, "fresh.two@example.com")).toContainText("排队中");
});

test("the notes say a mail is requested, never that one is or is not sent: the state is the invitation row's own", async ({ page, request }) => {
  await signIn(page, "/invites");
  await expect(page.getByTestId("mail-note")).toHaveText("没配发信服务：不会发邀请通知。邀请之后，在这里取登录验证码转给对方。");

  await setFake(request, { mail_configured: true });
  await page.reload();
  const on = page.getByTestId("mail-note");
  await expect(on).toHaveText("发信服务配好了：每个邀请会请求发一封邀请通知，状态看「邀请通知」一列；登录验证码也会发到对方邮箱。对方没收到验证码时，可以在这里取出来转给他。");
  await expect(on).not.toContainText("会发一封");
  await expect(on).not.toContainText("没有发邮件");
});

test("inviting from the sign-up list: the sentence says a mail is requested, and it points to the Invitations page", async ({ page }) => {
  await signIn(page, "/waitlist");
  await row(page, "new.ada@example.com").getByRole("button", { name: "邀请" }).click();
  const one = page.getByTestId("said");
  await expect(one).toContainText("请求发一封邀请通知");
  await expect(one).toContainText("结果在「邀请」页看");
  await expect(one).not.toContainText("没有发邮件");
  await expect(one).not.toContainText("已发");

  for (const email of ["new.bo@example.com", "new.chen@example.com"]) await page.getByLabel(`选中 ${email}`).check();
  await page.getByTestId("invite-selected").click();
  await expect(page.getByTestId("said")).toHaveText("已邀请 2 人，另有 0 人本来就在邀请名单里。配好发信服务时，每个新邀请的人会请求发一封邀请通知，结果在「邀请」页看。");
});


/**
 * One person is invited from one window. Then that person and a new one are invited as a batch from a second
 * window that has not been refreshed since it was opened: it still lists both as new. The core answers added 1, already 1; only the new
 * row is queued, and the one that was invited before keeps the invitation it had. Made-up addresses, the fake core.
 * Returns the window the batch was sent from: its sentence is the one to read.
 */
async function inviteMixedBatch(page: Page, request: APIRequestContext, button: string): Promise<Page> {
  const [old, fresh] = ["new.ada@example.com", "new.bo@example.com"];
  const stale = await page.context().newPage();
  await stale.goto("/waitlist");
  // Wait until the second window has its list (it is fetched after the page loads), so it really is the old one.
  await expect(row(stale, old)).toHaveAttribute("data-status", "new");
  await expect(row(stale, fresh)).toHaveAttribute("data-status", "new");
  await row(page, old).getByRole("button", { name: button }).click();
  await expect(row(page, old)).toHaveAttribute("data-status", "invited");
  const listed = async (email: string) => ((await (await page.request.get("/api/invites")).json()) as { invites: Record<string, unknown>[] }).invites.filter((i) => i.email === email);
  const before = await listed(old);
  expect(before).toHaveLength(1);

  // The old window still lists both as new, with the checkboxes.
  await expect(row(stale, old)).toHaveAttribute("data-status", "new");
  const select = button === "Invite" ? "Select" : "选中";
  await stale.getByLabel(`${select} ${old}`).check();
  await stale.getByLabel(`${select} ${fresh}`).check();
  await stale.getByTestId("invite-selected").click();
  await expect(row(stale, fresh)).toHaveAttribute("data-status", "invited");

  expect(await listed(old)).toEqual(before);
  const added = await listed(fresh);
  expect(added).toHaveLength(1);
  expect((added[0].mail as { state: string }).state).toBe("queued");
  const last = (await requests(request)).at(-1) as { emails: string[] };
  expect(last.emails).toEqual([old, fresh]);
  return stale;
}

/**
 * Two operators have the sign-up list open on the same new person. The first invites; the second, on a page that
 * was not refreshed since, invites the same person. Returns the second window and the invitation as the portal
 * listed it after each. Made-up address, the fake core: nothing is sent.
 */
async function inviteFromTwoWindows(page: Page, context: BrowserContext, request: APIRequestContext, email: string, button: string) {
  // Mail is configured, so a new invitation is queued: its state says whether the second click changed anything.
  await setFake(request, { mail_configured: true });
  await signIn(page, "/waitlist");
  const second = await context.newPage();
  await second.goto("/waitlist");
  await expect(row(second, email)).toHaveAttribute("data-status", "new");
  await expect(row(page, email)).toHaveAttribute("data-status", "new");

  await row(page, email).getByRole("button", { name: button }).click();
  await expect(row(page, email)).toHaveAttribute("data-status", "invited");
  const listed = async () => ((await (await page.request.get("/api/invites")).json()) as { invites: Record<string, unknown>[] }).invites.filter((i) => i.email === email);
  const afterFirst = await listed();

  // The second window still shows the row as new, with its Invite button.
  await expect(row(second, email)).toHaveAttribute("data-status", "new");
  await row(second, email).getByRole("button", { name: button }).click();
  await expect(row(second, email)).toHaveAttribute("data-status", "invited");
  return { second, afterFirst, afterSecond: await listed() };
}

test("inviting from the sign-up list hands the core each person's sign-up language; pasted emails with no sign-up row get none", async ({ page, request }) => {
  await signIn(page, "/waitlist");
  // new.ada signed up from the English page, new.bo from the Chinese one (dev/waitlist/seed.sql).
  const sent = await page.request.post("/api/waitlist/invite", { data: { emails: ["new.ada@example.com", "new.bo@example.com"] }, headers: CHANGE });
  expect(sent.ok()).toBe(true);
  const [first] = await requests(request);
  expect(first).toEqual({ emails: ["new.ada@example.com", "new.bo@example.com"], langs: { "new.ada@example.com": "en", "new.bo@example.com": "zh" } });

  // Pasted on the invitation page: the one that is on the sign-up list gets its language, the other none.
  const pasted = await page.request.post("/api/invites", { data: { text: "new.chen@example.com\nnobody.here@example.com" }, headers: CHANGE });
  expect(pasted.ok()).toBe(true);
  const second = (await requests(request))[1];
  expect(second).toEqual({ emails: ["new.chen@example.com", "nobody.here@example.com"], langs: { "new.chen@example.com": "zh" } });

  // Nobody on the sign-up list: no "langs" at all, and the request is the one it always was.
  const third = await page.request.post("/api/invites", { data: { text: "stranger.only@example.com" }, headers: CHANGE });
  expect(third.ok()).toBe(true);
  expect((await requests(request))[2]).toEqual({ emails: ["stranger.only@example.com"] });
});

test("two windows on the sign-up list, the same person invited twice: the second says it was already on the list and requests nothing", async ({ page, context, request }) => {
  const email = "new.ada@example.com";
  const { second, afterFirst, afterSecond } = await inviteFromTwoWindows(page, context, request, email, "邀请");

  await expect(said(page)).toContainText("请求发一封邀请通知");
  const again = said(second);
  await expect(again).toHaveText("new.ada@example.com 本来就在邀请名单里，这次没有再请求邀请通知，原来的状态在「邀请」页看。");
  await expect(again).not.toContainText("请求发一封");
  await expect(again).not.toContainText("已邀请");
  await expect(again).not.toHaveClass(/bad/);

  // The invitation (its mail state and times included) is the one the first window made; nothing new, nothing changed.
  expect(afterFirst).toHaveLength(1);
  expect((afterFirst[0].mail as { state: string }).state).toBe("queued");
  expect(afterSecond).toEqual(afterFirst);
  await page.goto("/invites");
  await expect(page.locator(`tr[data-email="${email}"]`)).toHaveCount(1);
  await expect(cell(page, email)).toHaveAttribute("data-state", "queued");
  await expect(cell(page, email)).toContainText("排队中");
  // Both requests reached the core; the second was told "already".
  expect(await requests(request)).toHaveLength(2);
});

test("a batch of one new and one already invited: the counts sentence says 1 and 1, and only the new row is queued", async ({ page, request }) => {
  await setFake(request, { mail_configured: true });
  await signIn(page, "/waitlist");
  const batch = await inviteMixedBatch(page, request, "邀请");
  await expect(said(batch)).toHaveText("已邀请 1 人，另有 1 人本来就在邀请名单里。配好发信服务时，每个新邀请的人会请求发一封邀请通知，结果在「邀请」页看。");
});

test.describe("in English", () => {
  test.use({ locale: "en-GB" });
  test("the mail column reads in English too, with the same distinctions", async ({ page }) => {
    await signIn(page, "/invites");
    await expect(cell(page, "invited.lin@example.com")).toContainText("Accepted (not the same as delivered)");
    await expect(cell(page, "invited.omar@example.com")).toContainText("Result unknown: it may have gone out");
    await expect(cell(page, "invited.omar@example.com")).toContainText("Inviting again may send the person a second mail.");
    await expect(cell(page, "pending.kai@example.com")).toContainText("Failed: the mail service refused it");
    await expect(cell(page, "pending.kai@example.com")).toContainText("Fix the setting, then you can withdraw and invite again.");
    await expect(cell(page, "pending.ines@example.com")).toContainText("Queued");
  });

  test("the notes read in English: a mail is requested, its state is on the invitation row", async ({ page, request }) => {
    await signIn(page, "/invites");
    await expect(page.getByTestId("mail-note")).toHaveText("Mail is not configured: no invitation mail is sent. After inviting, get a sign-in code here and pass it on.");
    await setFake(request, { mail_configured: true });
    await page.reload();
    await expect(page.getByTestId("mail-note")).toHaveText(
      "Mail is configured: each invitation requests one invitation mail; the Invitation mail column shows its state. Sign-in codes are emailed too. If a code does not arrive, get it here and pass it on.",
    );

    await page.goto("/waitlist");
    await row(page, "new.ada@example.com").getByRole("button", { name: "Invite" }).click();
    await expect(page.getByTestId("said")).toHaveText(
      "Invited new.ada@example.com. This email can sign in now. When mail is configured, one invitation mail is requested; its state is on Invitations.",
    );
    for (const email of ["new.bo@example.com", "new.chen@example.com"]) await page.getByLabel(`Select ${email}`).check();
    await page.getByTestId("invite-selected").click();
    await expect(page.getByTestId("said")).toHaveText(
      "New invitations: 2. Already on the invitation list: 0. When mail is configured, one invitation mail is requested for each new invitation; its state is on Invitations.",
    );
  });

  test("two windows, the same person invited twice: the second reads that it was already on the list and requests nothing", async ({ page, context, request }) => {
    const email = "new.ada@example.com";
    const { second, afterFirst, afterSecond } = await inviteFromTwoWindows(page, context, request, email, "Invite");

    await expect(said(page)).toContainText("one invitation mail is requested");
    const again = said(second);
    await expect(again).toHaveText("new.ada@example.com was already on the invitation list, so no new invitation mail was requested. Its state is on Invitations.");
    await expect(again).not.toContainText("one invitation mail is requested");
    await expect(again).not.toContainText("Invited new.ada");
    await expect(again).not.toHaveClass(/bad/);

    expect(afterFirst).toHaveLength(1);
    expect(afterSecond).toEqual(afterFirst);
    await page.goto("/invites");
    await expect(page.locator(`tr[data-email="${email}"]`)).toHaveCount(1);
    await expect(cell(page, email)).toHaveAttribute("data-state", "queued");
    await expect(cell(page, email)).toContainText("Queued");
  });

  test("a batch of one new and one already invited: the counts sentence reads 'label: number', exactly", async ({ page, request }) => {
    await setFake(request, { mail_configured: true });
    await signIn(page, "/waitlist");
    const batch = await inviteMixedBatch(page, request, "Invite");
    await expect(said(batch)).toHaveText("New invitations: 1. Already on the invitation list: 1. When mail is configured, one invitation mail is requested for each new invitation; its state is on Invitations.");
    await expect(said(batch)).not.toContainText("people");
    await expect(said(batch)).not.toContainText("were");
  });
});
