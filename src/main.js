import Apify from 'apify';
import fs from 'fs';
const { log } = Apify.utils;

Apify.main(async () => {
    const startTime = Date.now();
    log.info('🚀 Actor iniciado - Iniciando execução híbrida (SSR + Network Interception)');

    const input = await Apify.getInput();
    const {
        adLanguage,
        country,
        keyword,
        likes = "Top 1~20%",
        maxResults = 50,
        objective = "Video Views",
        time = "Last 180 Days"
    } = input;

    log.info('📥 Input recebido com sucesso', input);

    if (!adLanguage || !country || !keyword) {
        log.error('❌ Campos obrigatórios faltando');
        throw new Error("Campos obrigatórios faltando: adLanguage, country, keyword");
    }

    // Container for intercepted ads
    const interceptedAds = [];
    const processedAdIds = new Set();

    // Helper function to normalize and add ads
    const processAds = (adsList, source) => {
        let newCount = 0;
        adsList.forEach(ad => {
            const id = ad.ad_id || ad.item_id || ad.id;
            if (!id || processedAdIds.has(id)) return;

            // Normalization logic handling both API and __NEXT_DATA__ structures
            const normalizedAd = {
                id: id,
                title: ad.ad_title || ad.title || ad.bestTitle || (Array.isArray(ad.title) ? ad.title[0] : ad.title),
                advertiser: ad.advertiser_name || ad.author_name, // Might be missing in some structures
                video_url: ad.video_url || ad.video_info?.url || ad.videoInfo?.videoUrl?.['720P'] || ad.videoInfo?.videoUrl?.['540P'],
                cover_image: ad.cover_url || ad.video_info?.cover || ad.videoInfo?.cover,
                metrics: {
                    likes: ad.like_count || ad.digg_count || ad.metrics?.like,
                    shares: ad.share_count || ad.metrics?.share,
                    comments: ad.comment_count || ad.metrics?.comment,
                    ctr: ad.ctr,
                    cvr: ad.cvr
                },
                landing_page: ad.landing_page_url,
                industry: ad.industry || ad.industryKey,
                objective: ad.objective || ad.objectiveKey,
                source: source,
                raw_data: ad
            };

            interceptedAds.push(normalizedAd);
            processedAdIds.add(id);
            newCount++;
        });
        if (newCount > 0) {
            log.info(`✅ Adicionados ${newCount} novos anúncios via ${source}`);
        }
    };

    log.info('🌐 Iniciando browser com Playwright...');
    const browser = await Apify.launchPlaywright({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    const page = await browser.newPage();
    log.info('📄 Nova página aberta no navegador');

    // 📡 NETWORK INTERCEPTION LISTENER
    page.on('response', async response => {
        const url = response.url();
        // Filter for the specific API endpoint
        if (url.includes('/top_ads/v2/list') || url.includes('/inspiration/item_list')) {
            try {
                const contentType = response.headers()['content-type'];
                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    const adsList = data.data?.ads || data.data?.list || [];
                    if (adsList.length > 0) {
                        log.info(`🔥 Interceptado pacote de rede com ${adsList.length} itens`);
                        processAds(adsList, 'Network');
                    }
                }
            } catch (e) {
                log.debug(`⚠️ Erro ao processar resposta JSON: ${e.message}`);
            }
        }
    });

    try {
        const baseUrl = 'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en';
        const searchUrl = `${baseUrl}?country=${country}&language=${adLanguage}&keyword=${encodeURIComponent(keyword)}&period=${time}`;

        log.info(`➡️ Acessando página: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
        log.info('✅ Página carregada');

        // 🕵️‍♂️ EXTRACT FROM __NEXT_DATA__ (SSR Data)
        log.info('🕵️‍♂️ Tentando extrair dados iniciais do __NEXT_DATA__...');
        const nextDataAds = await page.evaluate(() => {
            try {
                const script = document.getElementById('__NEXT_DATA__');
                if (!script) return [];
                const json = JSON.parse(script.innerText);
                return json.props?.pageProps?.data?.materials || [];
            } catch (e) {
                return [];
            }
        });

        if (nextDataAds.length > 0) {
            log.info(`📦 Encontrados ${nextDataAds.length} anúncios no HTML inicial (__NEXT_DATA__)`);
            processAds(nextDataAds, 'SSR');
        } else {
            log.warning('⚠️ Nenhum anúncio encontrado no __NEXT_DATA__');
        }

        // 🕐 Wait for hydration and potential initial network calls
        await page.waitForTimeout(5000);

        // 🔄 SCROLL LOOP to trigger more API calls
        log.info('🔄 Iniciando scroll para carregar mais anúncios...');
        let previousCount = interceptedAds.length;
        let noNewAdsCount = 0;

        for (let i = 0; i < 15; i++) { // Increased scroll attempts
            if (interceptedAds.length >= maxResults) {
                log.info('🎯 Atingiu o limite máximo de resultados desejados.');
                break;
            }

            // Scroll down
            await page.evaluate(() => window.scrollBy(0, 1500));
            await page.waitForTimeout(4000); // Wait for API response

            const currentCount = interceptedAds.length;
            log.info(`📊 Anúncios coletados até agora: ${currentCount}`);

            if (currentCount === previousCount) {
                noNewAdsCount++;
                // Try scrolling up a bit and then down again to trigger observers
                if (noNewAdsCount === 2) {
                    await page.evaluate(() => window.scrollBy(0, -500));
                    await page.waitForTimeout(1000);
                }
                if (noNewAdsCount >= 4) {
                    log.info('🛑 Sem novos anúncios após 4 tentativas de scroll. Parando.');
                    break;
                }
            } else {
                noNewAdsCount = 0;
            }
            previousCount = currentCount;
        }

        log.info(`🏁 Total final de anúncios únicos: ${interceptedAds.length}`);

        if (interceptedAds.length === 0) {
            log.warning('⚠️ Nenhum anúncio foi interceptado. Salvando HTML para debug.');
            await Apify.setValue('ERROR_HTML', await page.content(), { contentType: 'text/html' });
            await page.screenshot({ path: 'debug_screenshot.png' });
            await Apify.setValue('ERROR_SCREENSHOT', await fs.promises.readFile('debug_screenshot.png'), { contentType: 'image/png' });
        } else {
            // Slice to maxResults
            const finalAds = interceptedAds.slice(0, maxResults);
            log.info(`💾 Salvando ${finalAds.length} anúncios no dataset...`);
            await Apify.pushData(finalAds);
        }

    } catch (err) {
        log.error('❌ Erro fatal durante execução', err);
        throw err;
    } finally {
        await browser.close();
        const runtime = ((Date.now() - startTime) / 1000).toFixed(2);
        log.info(`🏁 Execução concluída em ${runtime}s`);
    }
});
