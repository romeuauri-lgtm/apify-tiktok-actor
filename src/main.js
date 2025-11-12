import Apify from 'apify';
const { log } = Apify.utils;

Apify.main(async () => {
    const input = await Apify.getInput();
    const {
        adLanguage,
        country,
        keyword,
        likes = "Top 1~20%",
        maxResults = 5,
        objective = "Video Views",
        time = "Last 180 Days"
    } = input;

    if (!adLanguage || !country || !keyword) {
        throw new Error("Campos obrigatórios faltando: adLanguage, country, keyword");
    }

    log.info('Input recebido', input);

    const browser = await Apify.launchPlaywright({
        headless: true,
        stealth: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    // ✅ User-agent e viewport realistas
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    try {
        await page.goto('https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en', { waitUntil: 'domcontentloaded' });
        log.info('Página inicial do TikTok Creative Center carregada');

        // 🔗 Geração de URL de pesquisa
        const searchUrl = `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?country=${country}&language=${adLanguage}&keyword=${encodeURIComponent(keyword)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
        log.info(`Página de resultados carregada: ${searchUrl}`);

        // ⏳ Esperar até que os anúncios sejam realmente renderizados
        await page.waitForFunction(() => {
            const cards = document.querySelectorAll('.card-container, .ad-card');
            return cards.length > 0;
        }, { timeout: 20000 }).catch(() => log.warning('Nenhum anúncio visível após 20s'));

        // 🧩 Extração dos anúncios
        const adsData = await page.evaluate(() => {
            const ads = [];
            document.querySelectorAll('.card-container, .ad-card').forEach(card => {
                ads.push({
                    title: card.querySelector('.ad-title, .title, .header')?.innerText?.trim() || null,
                    metrics: card.querySelector('.data-value, .stats')?.innerText?.trim() || null,
                    advertiser: card.querySelector('.advertiser, .brand')?.innerText?.trim() || null,
                    link: card.querySelector('a')?.href || null,
                });
            });
            return ads;
        });

        log.info(`✅ Total de anúncios coletados: ${adsData.length}`);

        if (adsData.length === 0) {
            const html = await page.content();
            log.warning(`HTML capturado (para debug): ${html.slice(0, 800)}...`);
        }

        await Apify.pushData(adsData);
        log.info('Dados salvos no dataset.');

    } catch (err) {
        log.error('Erro durante scraping', err);
    } finally {
        await browser.close();
        log.info('Browser fechado');
    }
});
