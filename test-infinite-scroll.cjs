const { chromium } = require('playwright');

async function testInfiniteScroll() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
    
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForSelector('#gameGrid .card-wrapper', { timeout: 10000 });
    
    // Get initial count
    let cardCount = await page.$eval('#gameGrid', el => el.querySelectorAll('.card-wrapper').length);
    console.log(`Initial cards: ${cardCount}`);
    
    // Check if loadMoreTrigger is visible
    const triggerVisible = await page.$eval('#loadMoreTrigger', el => {
        const rect = el.getBoundingClientRect();
        return { 
            visible: rect.width > 0 && rect.height > 0,
            rect: rect
        };
    });
    console.log('Trigger visibility:', triggerVisible);
    
    // Scroll to trigger
    await page.evaluate(() => {
        const trigger = document.getElementById('loadMoreTrigger');
        if (trigger) trigger.scrollIntoView({ behavior: 'smooth' });
    });
    
    await page.waitForTimeout(2000);
    
    // Check count after scroll
    cardCount = await page.$eval('#gameGrid', el => el.querySelectorAll('.card-wrapper').length);
    console.log(`Cards after first scroll: ${cardCount}`);
    
    // Scroll again
    await page.evaluate(() => {
        const trigger = document.getElementById('loadMoreTrigger');
        if (trigger) trigger.scrollIntoView({ behavior: 'smooth' });
    });
    
    await page.waitForTimeout(2000);
    
    cardCount = await page.$eval('#gameGrid', el => el.querySelectorAll('.card-wrapper').length);
    console.log(`Cards after second scroll: ${cardCount}`);
    
    // Check IntersectionObserver is working
    const observerWorking = await page.evaluate(() => {
        const trigger = document.getElementById('loadMoreTrigger');
        const container = document.getElementById('scrollContainer');
        return {
            triggerInContainer: container.contains(trigger),
            triggerRect: trigger.getBoundingClientRect(),
            containerRect: container.getBoundingClientRect()
        };
    });
    console.log('Geometry:', observerWorking);
    
    await browser.close();
}

testInfiniteScroll().catch(console.error);