// src/main.js
import Apify from 'apify';
const { log } = Apify;

Apify.main(async () => {
    const input = await Apify.getInput() || {};
    const { keyword = 'hair clip', country = 'ES', limit = 20 } = input;

    // CORREÇÃO: usar launchPlaywright()
    const browser = await Apify.launchPlaywright({
        launchOptions: { headless: true },
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://ads.tiktok.com/business/creativecenter/inspiration/topads/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    const title = await page.title();
    const cookies = await context.cookies();

    await Apify.pushData({ input: { keyword, country, limit }, meta: { title, timestamp: new Date().toISOString() }, cookies });

    await browser.close();
    log.info('✅ Actor finished successfully');
});
