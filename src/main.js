import Apify from 'apify';
import fs from 'fs';
const { log } = Apify.utils;

Apify.main(async () => {
    const startTime = Date.now();
    log.info('🚀 Actor iniciado - Iniciando execução principal');

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

    log.info('📥 Input recebido com sucesso', input);

    if (!adLanguage || !country || !keyword) {
        log.error('❌ Campos obrigatórios faltando');
        throw new Error("Campos obrigatórios faltando: adLanguage, country, keyword");
    }

    // =======================
    // 📌 BROWSER LAUNCH DEBUG
    // =======================
    log.info('🌐 Iniciando browser com Playwright...');
    let browser;

    try {
        browser = await Apify.launchPlaywright({
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
        log.info('✅ Browser iniciado com sucesso');
    } catch (e) {
        log.error('❌ Falha ao iniciar Playwright!', e);
        throw e;
    }

    const page = await browser.newPage();
    log.info('📄 Nova página aberta no navegador');

    try {
        log.info('➡️ Acessando página inicial do TikTok Creative Center...');
        await page.goto(
            'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en',
            { waitUntil: 'domcontentloaded' }
        );
        log.info('✅ Página inicial carregada com sucesso');

        const searchUrl = `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?country=${country}&language=${adLanguage}&keyword=${encodeURIComponent(keyword)}`;
        log.info(`🔍 Navegando até a página de resultados: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
        log.info('✅ Página de resultados carregada com sucesso');

        // 🕐 Espera pelos anúncios visíveis
        log.info('⌛ Aguardando renderização dos anúncios...');
        await page.waitForFunction(() => {
            const cards = document.querySelectorAll('.card-container, .ad-card');
            return cards.length > 0;
        }, { timeout: 180000 }).catch(() => log.warning('⚠️ Nenhum anúncio visível após 3 minutos'));

        // 🔄 SCROLL DOWN
        log.info('🔄 Executando scroll para forçar renderização completa...');
        await page.evaluate(async () => {
            for (let i = 0; i < 5; i++) {
                window.scrollBy(0, 1000);
                await new Promise(r => setTimeout(r, 1000));
            }
        });
        log.info('✅ Scroll concluído, iniciando extração de dados');

        // EXTRAÇÃO
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

        log.info(`📊 Total de anúncios coletados: ${adsData.length}`);

        if (adsData.length === 0) {
            log.warning('⚠️ Nenhum anúncio encontrado — capturando HTML para debug');
            const html = await page.content();
            log.debug(`🧩 HTML parcial capturado (primeiros 800 caracteres): ${html.slice(0, 800)}...`);

            // 🔥 ADICIONADO: salvar HTML completo
            await Apify.setValue('ERROR_HTML', html, { contentType: 'text/html' });
            log.info('🧾 HTML completo salvo em Key-value store como ERROR_HTML');
        }

        log.info('💾 Salvando dados no dataset...');
        await Apify.pushData(adsData);
        log.info('✅ Dados salvos com sucesso no dataset');

    } catch (err) {
        log.error('❌ Erro durante scraping', err);

        // ⚠️ Screenshot para debug
        try {
            log.warning('📸 Capturando screenshot da falha...');
            await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
            await Apify.setValue('ERROR_SCREENSHOT', await fs.promises.readFile('error_screenshot.png'), { contentType: 'image/png' });
            log.info('📸 Screenshot salva como OUTPUT -> ERROR_SCREENSHOT');
        } catch (sErr) {
            log.error('❌ Falha ao capturar screenshot', sErr);
        }

        // ⚠️ HTML para debug (fallback)
        try {
            const html = await page.content();
            await Apify.setValue('ERROR_HTML', html, { contentType: 'text/html' });
            log.info('🧩 HTML capturado como OUTPUT -> ERROR_HTML');
        } catch (hErr) {
            log.error('❌ Falha ao capturar HTML', hErr);
        }

    } finally {
        log.info('🧹 Fechando browser e encerrando Actor...');
        await browser.close();
        const runtime = ((Date.now() - startTime) / 1000).toFixed(2);
        log.info(`🏁 Browser fechado - Execução concluída em ${runtime}s`);
    }
});
