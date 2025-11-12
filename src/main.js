import Apify from 'apify';
const { log, utils } = Apify;

Apify.main(async () => {
    const input = await Apify.getInput() || {};
    const { keyword = 'hair clip', country = 'ES', limit = 20 } = input;

    const browser = await Apify.launchPlaywrightBrowser({
        launchOptions: { headless: true },
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navega para a página do Creative Center (exemplo)
    await page.goto('https://ads.tiktok.com/business/creativecenter/inspiration/topads/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    // Aqui: inserir a lógica para pesquisar pelo keyword e extrair os dados desejados.
    // Exemplo simplificado: retorna título da página e cookies atuais
    const title = await page.title();
    const cookies = await context.cookies();

    // Exemplo de output estruturado
    const output = {
        input: { keyword, country, limit },
        meta: { title, timestamp: new Date().toISOString() },
        cookies,
    };

    // Salva no dataset do Actor
    await Apify.pushData(output);

    await browser.close();
    log.info('Actor finished successfully');
});
