// #106: the invitation list shows the invitation mail as the core reports it, and the portal hands the core each
// person's sign-up language. The mail itself is the core's: nothing here sends anything.
import { expect, test } from "@playwright/test";
import { CHANGE, FAKE, reset, row, setFake, signIn } from "./helpers";

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
});
