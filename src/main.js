import { Actor } from 'apify';
import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';

await Actor.init();

const input = await Actor.getInput();
const {
    keyword,
    country = 'US',
    adLanguage = 'en',
    maxResults = 50,
    period = '30', // Last 30 days default
    objective = '3,1' // Conversions, Traffic
} = input;

console.log('🚀 Iniciando TikTok Ads Scraper (API Mode)...');
console.log('📥 Input:', { keyword, country, adLanguage, maxResults });

const cookieJar = new CookieJar();
const headers = {
    'Referer': 'https://ads.tiktok.com/creative/inspiration/top-ads/library',
    'Origin': 'https://ads.tiktok.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
};

// CONFIGURAR PROXY (Essencial para evitar 40101)
// Tenta usar Residential Proxy (US) se disponível, senão usa AUTO
let proxyConfiguration;
let proxyUrl;
const sessionId = Math.floor(Math.random() * 100000).toString(); // Session ID fixo para manter o mesmo IP

try {
    // Tentar Residential primeiro (se o usuário tiver acesso)
    proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ['RESIDENTIAL'],
        countryCode: 'US',
    });
    proxyUrl = await proxyConfiguration.newUrl({ sessionId });
    console.log(`✅ Usando Proxy Residencial (US) - Session: ${sessionId}`);
} catch (e) {
    // Fallback para AUTO (disponível em todos os planos)
    console.log('⚠️ Proxy Residencial não disponível, usando AUTO...');
    proxyConfiguration = await Actor.createProxyConfiguration();
    proxyUrl = await proxyConfiguration.newUrl({ sessionId });
    console.log(`✅ Usando Proxy AUTO - Session: ${sessionId}`);
}

console.log(`🌐 Proxy URL gerada: ${proxyUrl ? 'Sim' : 'Não'}`);

// 1. Inicializar Sessão Anônima
console.log('1️⃣ Inicializando sessão...');
try {
    // Acessar home para pegar CSRF e ttwid
    await gotScraping({
        url: 'https://ads.tiktok.com/creative/inspiration/top-ads/library',
        cookieJar,
        headers,
        proxyUrl
    });

    // Registrar WebID (Device ID)
    const webIdRes = await gotScraping({
        url: 'https://mcs-sg.tiktokv.com/v1/user/webid',
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

    const webId = webIdRes.body?.web_id;
    if (webId) {
        console.log(`✅ WebID gerado: ${webId}`);
        headers['web-id'] = webId;
        headers['x-web-id'] = webId;
        headers['anonymous-user-id'] = webId;
    }

    // Pegar CSRF token dos cookies
    const cookies = cookieJar.getCookiesSync('https://ads.tiktok.com');
    const csrfToken = cookies.find(c => c.key === 'csrftoken')?.value;
    if (csrfToken) {
        headers['x-csrftoken'] = csrfToken;
        console.log('✅ CSRF Token obtido');
    }

} catch (e) {
    console.log('⚠️ Aviso na inicialização de sessão (tentando continuar):', e.message);
}

// 2. Loop de Paginação na API
let page = 1;
let collectedAds = 0;
const results = [];

console.log('2️⃣ Iniciando coleta de anúncios...');

while (collectedAds < maxResults) {
    console.log(`➡️ Requisitando página ${page}...`);

    const url = 'https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list';
    const searchParams = {
        page: page.toString(),
        limit: '20', // Max per request
        period: period,
        country_code: country,
        ad_language: adLanguage,
        objective: objective
    };

    // Adicionar keyword se existir
    if (keyword) {
        searchParams.keyword = keyword;
    }

    try {
        const response = await gotScraping({
            url,
            searchParams,
            cookieJar,
            headers,
            proxyUrl,
            responseType: 'json',
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 110 }],
                devices: ['desktop'],
                locales: ['en-US'],
                operatingSystems: ['windows'],
            }
        });

        const data = response.body;

        if (data.code !== 0) {
            console.log(`❌ Erro na API: ${data.msg} (Code: ${data.code})`);

            if (data.code === 40101) {
                console.log('⚠️ Erro de permissão/região. Se estiver rodando localmente fora de US/EU, isso é esperado.');
                console.log('💡 FAÇA O DEPLOY NA APIFY PARA FUNCIONAR!');
            }
            break;
        }

        const ads = data.data?.list || data.data?.ads || [];

        if (ads.length === 0) {
            console.log('🏁 Sem mais resultados.');
            break;
        }

        console.log(`📦 Encontrados ${ads.length} anúncios na página ${page}`);

        for (const ad of ads) {
            if (collectedAds >= maxResults) break;

            // Normalizar dados
            const normalizedAd = {
                id: ad.ad_id || ad.item_id || ad.id,
                title: ad.ad_title || ad.title,
                advertiser: ad.advertiser_name || ad.author_name,
                video_url: ad.video_info?.video_url?.['720p'] || ad.video_url,
                cover_image: ad.video_info?.cover || ad.cover_url,
                metrics: {
                    likes: ad.like_count || ad.digg_count,
                    shares: ad.share_count,
                    comments: ad.comment_count,
                    ctr: ad.ctr,
                    cvr: ad.cvr
                },
                landing_page: ad.landing_page_url,
                industry: ad.industry_key,
                objective: ad.objective_key,
                cost: ad.cost,
                raw_data: ad
            };

            results.push(normalizedAd);
            collectedAds++;
        }

        page++;
        // Pequeno delay para evitar rate limit
        await new Promise(r => setTimeout(r, 1000));

    } catch (error) {
        console.error('❌ Erro fatal na requisição:', error.message);
        break;
    }
}

// 3. Salvar Resultados
console.log(`💾 Salvando ${results.length} resultados...`);
await Actor.pushData(results);

console.log('✅ Concluído!');
await Actor.exit();
