import { expect, test } from '@playwright/test';

test('HIPAA demo scanner finds PHI locally @slow', async ({ page }) => {
  await page.goto('/scan');
  await expect(page.getByTestId('models-ready')).toBeVisible({ timeout: 90_000 });

  await page.getByTestId('scan-demo').click();
  await expect(page.getByTestId('phi-summary')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('finding-card').first()).toBeVisible();

  const identifierTexts = await page.getByTestId('finding-identifier').allTextContents();
  expect(identifierTexts.some((text) => /names/i.test(text))).toBe(true);
  expect(identifierTexts.some((text) => /geographic/i.test(text))).toBe(true);
});
