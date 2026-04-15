import { expect, test } from '@playwright/test';

function createPdfBuffer(): Buffer {
  const lines = [
    'Jordan Cipher',
    'Security Engineer',
    'jordan@example.com',
    'SUMMARY',
    'Builds local-first resume tooling.',
    'SKILLS',
    'TypeScript, Svelte, PDF.js',
    'PROJECTS',
    'ShieldCV Vault',
  ];
  const stream = [
    'BT',
    '/F1 18 Tf',
    '72 760 Td',
    ...lines.map((line, index) =>
      `${index === 0 ? '' : '0 -24 Td '}${`(${line.replace(/[()\\]/g, '\\$&')}) Tj`}`.trim()
    ),
    'ET',
  ].join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref
0 ${objects.length + 1}
0000000000 65535 f 
${offsets
  .slice(1)
  .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n `)
  .join('\n')}
trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefStart}
%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

test('resume CRUD and sandboxed PDF import flow', async ({ page }) => {
  const passphrase = 'correct horse battery staple';

  await page.goto('/resumes');
  await page.getByTestId('vault-passphrase').fill(passphrase);
  await page.getByTestId('unlock-vault').click();
  await expect(page.getByTestId('empty-resumes')).toBeVisible();

  await page.getByTestId('create-resume').click();
  await expect(page.getByTestId('save-resume')).toBeVisible();

  await page.getByTestId('input-name').fill('Casey Applicant');
  await page.getByTestId('input-label').fill('Privacy-minded Product Engineer');
  await page.getByTestId('input-email').fill('casey@example.com');
  await page.getByTestId('save-resume').click();
  await expect(page.getByTestId('autosave-status')).toContainText('Saved');

  const pdfBuffer = createPdfBuffer();

  await page.getByTestId('pdf-input').setInputFiles({
    name: 'resume-import.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
  });

  await expect(page.getByTestId('pdf-status')).toContainText('Imported text from', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('input-name')).toHaveValue('Casey Applicant');
  await page.getByTestId('save-resume').click();
  await expect(page.getByTestId('autosave-status')).toContainText('Saved');

  const editorUrl = page.url();
  await page.goto('/resumes');

  if (await page.getByTestId('vault-passphrase').isVisible()) {
    await page.getByTestId('vault-passphrase').fill(passphrase);
    await page.getByTestId('unlock-vault').click();
  }

  await expect(page.getByText('Casey Applicant')).toBeVisible();

  await page.goto(editorUrl);

  if (await page.getByTestId('vault-passphrase').isVisible()) {
    await page.getByTestId('vault-passphrase').fill(passphrase);
    await page.getByTestId('unlock-vault').click();
  }

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete this resume?' })).toBeVisible();
  await page.getByTestId('confirm-delete').click();
  await expect(page).toHaveURL(/\/resumes$/);
  await expect(page.getByTestId('empty-resumes')).toBeVisible();
});
