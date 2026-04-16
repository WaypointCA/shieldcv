import { expect, test } from '@playwright/test';

test('Attack Mode blocks all scripted attacks and verifies the audit chain', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const dialogs: string[] = [];
  const expectedConsoleErrors = [
    /Creating a TrustedTypePolicy named 'dompurify' violates the following Content Security Policy directive/,
    /Loading the image 'https:\/\/blocked-by-csp\.invalid\/attack-mode-probe\.png' violates the following Content Security Policy directive/,
  ];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  page.on('dialog', async (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss();
  });

  await page.goto('/attack-mode');
  await expect(page.getByRole('dialog', { name: 'Enter Attack Mode' })).toBeVisible();

  await page.getByTestId('enter-attack-mode').click();
  await expect(page.getByTestId('attack-count-copy')).toHaveText('7 attacks blocked', {
    timeout: 30_000,
  });

  await page.getByTestId('verify-audit-chain').click();
  await expect(page.getByTestId('chain-intact-badge')).toContainText('Chain intact', {
    timeout: 10_000,
  });

  await page.goto('/audit');
  await expect(page.getByText('attack blocked trusted types').first()).toBeVisible();
  await expect(page.getByText('attack blocked csp violation').first()).toBeVisible();

  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) => !expectedConsoleErrors.some((pattern) => pattern.test(message))
  );

  expect(unexpectedConsoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(dialogs).toEqual([]);
});
