import { Flip, MyBot } from '../types/autobuy';
import { getConfigProperty } from './configHelper';
import { getFastWindowClicker } from './fastWindowClick';
import { log, printMcChatToConsole } from './logger';
import { clickWindow, getWindowTitle, numberWithThousandsSeparators, sleep } from './utils';
import { ChatMessage } from 'prismarine-chat';
import { sendWebhookItemPurchased, sendWebhookItemPurchased100M } from './webhookHandler';
import { claimPurchased } from './ingameMessageHandler';
const fs = require('fs');
const path = require('path');

let notcoins = false;
let globalText = "";
let flips_bed = 0;
let no_beds = 0;
let buy_total = 0;
let sold_total = 0;

function updateTotalsFile() {
    const filePath = path.join(__dirname, 'totals.txt');
    const data = `buy_total=${buy_total}\nsold_total=${sold_total}\nflips_bed=${flips_bed}\nno_beds=${no_beds}`;
    fs.writeFileSync(filePath, data);
}

export function registerIngameMessage(bot: MyBot) {
    bot.on('message', (message: ChatMessage, type) => {
        let text = message.getText(null);
        if (type == 'chat') {
            if (text.startsWith("You") && text.includes("don't have") && text.includes('afford this bid')) {
                notcoins = true;
            }
            if (text.startsWith('You') && text.includes('purchased') && text.includes('for')) {
                globalText = text;
            }
            if (text.startsWith('You purchased')) {
                buy_total += 1;
                setTimeout(() => {
                    updateTotalsFile();
                }, 100);
            }
            if (text.startsWith('[Auction]') && text.includes('bought') && text.includes('for')) {
                sold_total += 1;
                setTimeout(() => {
                    updateTotalsFile();
                }, 100);
            }
        }
    });
}

export async function flipHandler(bot: MyBot, flip: Flip) {
    notcoins = false;
    flip.purchaseAt = new Date(flip.purchaseAt);

    if (bot.state) {
        setTimeout(() => {
            flipHandler(bot, flip);
        }, 275); // Reduced delay for faster retry
        return;
    }

    bot.state = 'purchasing'
    let timeout = setTimeout(() => {
        if (bot.state === 'purchasing') {
            log("Resetting 'bot.state === purchasing' lock")
            bot.state = null
            bot.removeAllListeners('windowOpen')
            notcoins = false;
        }
    }, 5000)
    let isBed = flip.purchaseAt.getTime() > new Date().getTime();
    let delayUntilBuyStart = isBed ? flip.purchaseAt.getTime() - new Date().getTime() - getConfigProperty('DELAY_TO_REMOVE_BED') : getConfigProperty('FLIP_ACTION_DELAY');

    bot.lastViewAuctionCommandForPurchase = `/viewauction ${flip.id}`;
    await sleep(delayUntilBuyStart)
    bot.chat(bot.lastViewAuctionCommandForPurchase);

    printMcChatToConsole(
        `§f[§4BAF§f]: §fTrying to purchase flip${isBed ? ' (Bed)' : ''}: ${flip.itemName} §ffor ${numberWithThousandsSeparators(
            flip.startingBid
        )} coins (Target: ${numberWithThousandsSeparators(flip.target)}) §e(Profit: +${numberWithThousandsSeparators(flip.target - flip.startingBid * 0.965).split(".")[0]})`
    )

    if (getConfigProperty('USE_WINDOW_SKIPS')) {
        useWindowSkipPurchase(bot, flip, isBed);
        
        // clear timeout after 1sec, so there are no weird overlaps that mess up the windowIds
        setTimeout(() => {
            bot.state = null
            clearTimeout(timeout)
        }, 1600)
    } else {
        await useRegularPurchase(bot, isBed, flip);
        await sleep(850);

        if (globalText.startsWith('You purchased')) {
            claimPurchased(bot);
            let value = flip.target - flip.startingBid;
            let valueMinus3_5Percent = value * 0.965;
            let result = numberWithThousandsSeparators(valueMinus3_5Percent);
            let parts = result.split(".");
            let formattedValue = parts[0];
            let numericValue = Number(formattedValue.replace(/,/g, ''));

            if (isBed) {
                flips_bed += 1;
                updateTotalsFile();
            }
            if (!isBed) {
                no_beds += 1;
                updateTotalsFile();
            }
            if (numericValue < 100000000) {
                sendWebhookItemPurchased(globalText.split(' purchased ')[1].split(' for ')[0],
                    globalText.split(' for ')[1].split(' coins!')[0], `${"+" + formattedValue}`);
            }
            if (numericValue >= 100000000) {
                sendWebhookItemPurchased100M(globalText.split(' purchased ')[1].split(' for ')[0],
                    globalText.split(' for ')[1].split(' coins!')[0], `${"+" + formattedValue}`);
            }
            globalText = '';
        } else {
            // Additional error handling to prevent unnecessary retries
            if (bot.state === 'purchasing') {
                log("Resetting 'bot.state === purchasing' lock due to error or item not found");
                bot.state = null;
                bot.removeAllListeners('windowOpen');
                notcoins = false;
            }
            globalText = '';
        }
    }
}
        
async function useRegularPurchase(bot: MyBot, isBed: boolean, flip: Flip) {
    bot.addListener('windowOpen', async window => {
        let title = getWindowTitle(window);
        let currentWindow = bot.currentWindow; // Rename 'window' to 'currentWindow'
        let total_clicks = 0;
        if (isBed && title.toString().includes('BIN Auction View')) {
            log(`Starting the bed loop... ${moment().format('ddd MMM DD YYYY HH:mm:ss.SSS [GMT]ZZ')}`);
            let items = currentWindow.containerItems(); // Use 'currentWindow' instead of 'window'
            bot.state = 'purchasing';

            // Filter out the 'black_stained_glass_pane' item
            items = items.filter(item => item.name !== 'black_stained_glass_pane');
            let potatoItem = items.find(item => item.name === 'potato');

            if (potatoItem) {
                console.log('Item "potato" found. Stopping the loop...');
                return;
            }

            while (!title.toString().includes('Confirm Purchase') && !potatoItem) {
                await sleep(getConfigProperty('DELAY_BETWEEN_CLICKS')); // Removed random delay
                clickWindow(bot, 31);
                total_clicks++;

                // Update the window and the list of items
                currentWindow = bot.currentWindow; // Use 'currentWindow' instead of 'window'
                title = getWindowTitle(currentWindow); // Use 'currentWindow' instead of 'window'
                items = currentWindow.containerItems().filter(item => item.name !== 'black_stained_glass_pane'); // Use 'currentWindow' instead of 'window'
                potatoItem = items.find(item => item.name === 'potato');

                if (potatoItem) {
                    console.log('Item "potato" found. Stopping the loop.');
                    break;
                }
                if (notcoins || total_clicks > 300) {
                    let title = getWindowTitle(currentWindow); // Use 'currentWindow' instead of 'window'
                    if (title.toString().includes('BIN Auction View')) {
                        printMcChatToConsole("§f[§4BAF§f]: §cClosing this flip because you don't have enough coins to purchase!");
                        bot.removeAllListeners('windowOpen');
                        bot.state = null;
                        bot.closeWindow(window); // Use 'currentWindow' instead of 'window'
                        notcoins = false;
                        return;
                    }
                }
            }
        }

        log(`Finished the bed loop... ${moment().format('ddd MMM DD YYYY HH:mm:ss.SSS [GMT]ZZ')}`);
        printMcChatToConsole(`§f[§4BAF§f]: §l§6Clicked ${total_clicks} times on the bed.`);
        total_clicks = 0;

        // Move this part inside the 'windowOpen' listener callback
        if (title.toString().includes('BIN Auction View')) {
            clickWindow(bot, 31);
        }

        if (title.toString().includes('Confirm Purchase')) {
            let startTime = Date.now();
            let itemFound = false;

            while (!itemFound) {
                let items = currentWindow.containerItems(); // Use 'currentWindow' instead of 'window'
                let item = items.find(item => item.name === 'green_terracotta');
                if (item) {
                    log(`Starting the Confirm button... ${moment().format('ddd MMM DD YYYY HH:mm:ss.SSS [GMT]ZZ')}`);
                    clickWindow(bot, 11);
                    try {
                        bot.removeAllListeners('windowOpen');
                        bot.state = null;
                        itemFound = true;

                        let endTime = Date.now();
                        let duration = endTime - startTime;
                        log(`Finished the Confirm button... ${moment().format('ddd MMM DD YYYY HH:mm:ss.SSS [GMT]ZZ')}. Total time: ${duration} ms`);

                        return;
                    } catch (error) {
                        return printMcChatToConsole(`Error in the try ${error}`);
                    }
                } else {
                    await sleep(5); // Removed random delay
                }
            }
        }
    });
}

async function useWindowSkipPurchase(bot: MyBot, flip: Flip, isBed: boolean) {
    let lastWindowId = getFastWindowClicker().getLastWindowId();
    if (isBed) {
        getFastWindowClicker().clickBedPurchase(flip.startingBid, lastWindowId + 1);
    } else {
        getFastWindowClicker().clickPurchase(flip.startingBid, lastWindowId + 1);
    }
    await sleep(getConfigProperty('FLIP_ACTION_DELAY')); // Removed random delay
    getFastWindowClicker().clickConfirm(flip.startingBid, flip.itemName, lastWindowId + 2);
}
