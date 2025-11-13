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

    // ✅ Usar diretamente o browser/contexto já fornecido pelo Apify
    const browser = await Apify.launchPlaywright({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    // ✅ Usar o contexto padrão retornado
    const page = await browser.newPage();

    try {
        await page.goto('https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en', { waitUntil: 'domcontentloaded' });
        log.info('Página inicial do TikTok Creative Center carregada');

        const searchUrl = `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?country=${country}&language=${adLanguage}&keyword=${encodeURIComponent(keyword)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
        log.info(`Página de resultados carregada: ${searchUrl}`);

        // 🕐 Espera os anúncios ficarem visíveis
        await page.waitForFunction(() => {
            const cards = document.querySelectorAll('.card-container, .ad-card');
            return cards.length > 0;
        }, { timeout: 180000 }).catch(() => log.warning('Nenhum anúncio visível após 20s'));

        // 🧭 Espera extra com scroll para garantir renderização completa
        await page.evaluate(async () => {
            for (let i = 0; i < 5; i++) {
                window.scrollBy(0, 1000);
                await new Promise(r => setTimeout(r, 1000));
            }
        });

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
