import puppeteer from 'puppeteer';
import { existsSync } from 'fs';

export async function ensureBrowser(): Promise<void> {
  try {
    const execPath = puppeteer.executablePath();

    if (existsSync(execPath)) {
      console.log('✓ Browser ready\n');
      return;
    }
  } catch {
    // executablePath throws if browser not installed
  }

  console.log('📥 Downloading browser (first-time setup, ~170MB)...');
  console.log('   This may take a few minutes.\n');

  // Launch and immediately close to trigger download
  // Puppeteer will automatically download the browser
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  await browser.close();

  console.log('✓ Browser download complete!\n');
}
