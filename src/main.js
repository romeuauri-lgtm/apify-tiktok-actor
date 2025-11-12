import Apify from 'apify';
const { log } = Apify.utils;

Apify.main(async () => {
    const input = await Apify.getInput();
    const { adLanguage, country, keyword, likes = "Top 1~20%", maxResults = 5, objective = "Video Views", time = "Last 180 Days" } = input;

    if (!adLanguage || !country || !keyword) {
        throw new Error("Campos obrigatórios faltando: adLanguage, country, keyword");
    }

    log.info('Input recebido', input);

    const browser = await Apify.launchPlaywright({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto('https://www.tiktok.com/');
        log.info('Página inicial do TikTok carregada');

        const searchUrl = `https://www.tiktok.com/business/en-US/creative-center/search?keyword=${encodeURIComponent(keyword)}&adLanguage=${adLanguage}&country=${country}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle' });
        log.info('Página de resultados de Ads carregada');

        await page.waitForSelector('.ad-card', { timeout: 10000 }).catch(() => log.warning('Nenhum anúncio encontrado'));

        const adsData = await page.evaluate(() => {
            const ads = [];
            document.querySelectorAll('.ad-card').forEach(card => {
                ads.push({
                    title: card.querySelector('.ad-title')?.innerText || null,
                    views: card.querySelector('.ad-views')?.innerText || null,
                });
            });
            return ads;
        });

        log.info('Ads coletados', adsData);
        await Apify.pushData(adsData);
        log.info('Dados salvos no dataset');

    } catch (err) {
        log.error('Erro durante scraping', err);
    } finally {
        await browser.close();
        log.info('Browser fechado');
    }
});
