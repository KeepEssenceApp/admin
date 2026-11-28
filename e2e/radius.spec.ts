// The one scale of rounding (spec design/tokens.css, e139a47), as a browser computes it: fields 14,
// buttons a pill, a dialog 28 (a phone's bottom sheet only on its top corners).
import { expect, test, type Locator } from "@playwright/test";
import { isPhone, reset, signIn } from "./helpers";

test.beforeEach(async ({ request }) => reset(request));

const corners = (el: Locator) =>
  el.evaluate((node) => {
    const s = getComputedStyle(node);
    return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius];
  });

test("buttons are pills, fields 14 px, the dialog 28 px (phone: top corners of a bottom sheet)", async ({ page }, info) => {
  await signIn(page, "/users/usr_0002");
  await expect(page.getByTestId("user-email")).toHaveText("joined.mei@example.com");

  // A button: the pill token (the browser reports 999px; it paints fully round).
  expect(await corners(page.locator(".actions .btn").first())).toEqual(["999px", "999px", "999px", "999px"]);

  await page.getByRole("button", { name: "删除账户", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "删除账户" });
  await expect(dialog).toBeVisible();

  const sheet = page.locator(".sheet");
  expect(await corners(sheet)).toEqual(isPhone(info) ? ["28px", "28px", "0px", "0px"] : ["28px", "28px", "28px", "28px"]);
  if (isPhone(info)) {
    // A bottom sheet sits on the bottom edge of the screen, full width.
    const box = (await sheet.boundingBox())!;
    const view = page.viewportSize()!;
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.width)).toBe(view.width);
    expect(Math.round(box.y + box.height)).toBe(view.height);
  }

  // The field inside the dialog.
  expect(await corners(dialog.locator('input[name="confirm_email"]'))).toEqual(["14px", "14px", "14px", "14px"]);
});

test("the days switch on Usage is a pill", async ({ page }) => {
  await signIn(page, "/usage");
  await expect(page.locator(".segments")).toBeVisible();
  expect(await corners(page.locator(".segments"))).toEqual(["999px", "999px", "999px", "999px"]);
});

test("the find field on the waitlist is 14 px", async ({ page }) => {
  await signIn(page, "/waitlist");
  const find = page.locator(".toolbar .find").first();
  await expect(find).toBeVisible();
  expect(await corners(find)).toEqual(["14px", "14px", "14px", "14px"]);
});
