import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';
import { Actor } from 'apify';

await Actor.init();

(async () => {
    console.log('🚀 Testando Endpoint US (Virginia) com Proxy AUTO...');

    const cookieJar = new CookieJar();
    const headers = {
        'Referer': 'https://ads.tiktok.com/creative/inspiration/top-ads/library',
        'Origin': 'https://ads.tiktok.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // Configurar Proxy AUTO
    const proxyConfiguration = await Actor.createProxyConfiguration();
    const sessionId = Math.floor(Math.random() * 100000).toString();
    const proxyUrl = await proxyConfiguration.newUrl(sessionId);
    console.log(`🌐 Proxy: ${proxyUrl}`);

    // 1. Inicializar Sessão
    console.log('1️⃣ Inicializando sessão...');
    try {
        await gotScraping({
            url: 'https://ads.tiktok.com/creative/inspiration/top-ads/library',
            cookieJar,
            headers,
            proxyUrl
        });

        // Tentar endpoint US (mcs-va)
        console.log('2️⃣ Registrando WebID em mcs-va.tiktokv.com (US)...');
        const webIdRes = await gotScraping({
            url: 'https://mcs-va.tiktokv.com/v1/user/webid', // MUDANÇA AQUI
            method: 'POST',
            json: {
                app_id: 1180,
                url: 'https://ads.tiktok.com/creative/inspiration/top-ads/library',
                user_agent: headers['User-Agent'],
                referer: headers['Referer'],
            },
            cookieJar,
            responseType: 'json',
            proxyUrl
        });

        console.log('   Response:', webIdRes.body);

        const webId = webIdRes.body?.web_id;
        if (webId) {
            console.log(`✅ WebID gerado: ${webId}`);
            headers['web-id'] = webId;
            headers['anonymous-user-id'] = webId;
        }

    } catch (e) {
        console.log('⚠️ Erro na inicialização:', e.message);
    }

    // 3. Tentar API
    console.log('3️⃣ Testando API de Anúncios...');
    const url = 'https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list';
    const searchParams = {
        page: '1',
        limit: '5',
        period: '30',
        country_code: 'US',
        ad_language: 'en',
        objective: '3,1'
    };

    try {
        const response = await gotScraping({
            url,
            searchParams,
            cookieJar,
            headers,
            proxyUrl,
            responseType: 'json'
        });

        console.log('✅ Status Code:', response.statusCode);
        console.log('📄 Body:', JSON.stringify(response.body, null, 2));

    } catch (error) {
        console.error('❌ Erro na requisição:', error.message);
    }

    await Actor.exit();
})();
