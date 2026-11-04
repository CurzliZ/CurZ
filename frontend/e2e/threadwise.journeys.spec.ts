import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openSampleWorkspace(page: Page) {
  await page.goto("/");
  const firstRunLoad = page.getByRole("button", { name: "Load sample vault" });
  if (await firstRunLoad.isVisible().catch(() => false)) {
    await firstRunLoad.click();
    await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  }

  await page.goto("/settings");
  await page.getByRole("button", { name: /sample vault/i }).first().click();
  await expect(page.getByText(/\d+ sample-marked notes remain in/)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openSampleWorkspace(page);
});

test("creates a note and keeps it after reload", async ({ page }) => {
  const title = "E2E persistence journey";
  const body = "This proof survives a browser refresh.";

  await page.goto("/notes");
  await page.getByRole("button", { name: "Create a new note" }).click();
  const titleField = page.getByRole("textbox", { name: "Note title" });
  const editor = page.getByRole("textbox", { name: "Note content" });
  await titleField.fill(title);
  await expect(titleField).toHaveValue(title);
  await expect(editor).toContainText(title);
  await editor.click();
  await editor.press("Control+End");
  await editor.type(body);
  await expect(editor).toContainText(body);
  await expect(page.locator(".save-state")).toHaveText("Unsaved changes");
  await expect(page.locator(".save-state")).toHaveText("Saved", { timeout: 10_000 });

  await page.reload();
  await page.getByRole("searchbox", { name: "Search notes" }).fill("persistence");
  const result = page.locator(".note-list-item").filter({ hasText: title });
  await expect(result).toBeVisible();
  await result.click();
  await expect(titleField).toHaveValue(title);
  await expect(editor).toContainText(body);
  await page.getByRole("button", { name: "Permanently delete note" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText("Note permanently deleted")).toBeVisible();
});

test("searches note content and opens the matching note", async ({ page }) => {
  await page.goto("/notes");
  await page.getByRole("searchbox", { name: "Search notes" }).fill("Problem statements");
  const result = page.locator(".note-list-item").filter({ hasText: "Problem statements" }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByRole("textbox", { name: "Note title" })).toHaveValue("Problem statements");
});

test("opens the sample vault Brain and its accessible list view", async ({ page }) => {
  await page.goto("/brain");
  await expect(page.getByRole("heading", { name: "Brain" })).toBeVisible();
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByRole("table", { name: /notes in this graph view/i })).toBeVisible();
  await expect(page.locator(".brain-table tbody tr").first()).toBeVisible();
});
