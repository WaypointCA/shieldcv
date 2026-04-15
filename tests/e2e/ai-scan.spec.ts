import { expect, test } from '@playwright/test';

test('AI scan extracts local NER entities @slow', async ({ page }) => {
  const passphrase = 'correct horse battery staple';

  await page.goto('/resumes');

  if (await page.getByTestId('vault-passphrase').isVisible()) {
    await page.getByTestId('vault-passphrase').fill(passphrase);
    await page.getByTestId('unlock-vault').click();
    await page.waitForTimeout(500);
  }

  await page.goto('/scan');
  await expect(page.getByTestId('models-ready')).toBeVisible({ timeout: 60_000 });

  await page.getByTestId('scan-text').fill('John Smith works at Anthropic in San Francisco');
  await page.getByTestId('extract-entities').click();

  await expect(page.getByTestId('entities-table')).toBeVisible();
  await expect(page.getByTestId('entity-label').filter({ hasText: 'PERSON' }).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('entity-label').filter({ hasText: 'LOCATION' }).first()).toBeVisible();
});
