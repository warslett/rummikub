import { test, expect, CLIENT_URL } from "./helpers";

test.describe("Home Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(CLIENT_URL);
  });

  test("TC-01: Home page loads", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Rummikub" })).toBeVisible();
    await expect(page.getByPlaceholder("Enter your name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Game" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Game" })).toBeDisabled();
  });

  test("TC-02: Create Game button enables with name", async ({ page }) => {
    await page.getByPlaceholder("Enter your name").fill("Alice");
    await expect(page.getByRole("button", { name: "Create Game" })).toBeEnabled();
  });
});
