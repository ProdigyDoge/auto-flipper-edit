import { MyBot } from '../types/autobuy';
import { log, printMcChatToConsole } from './logger';
import { clickWindow, getWindowTitle } from './utils';
import { ChatMessage } from 'prismarine-chat';
import { sendWebhookItemSold } from './webhookHandler';
import { getCurrentWebsocket } from './BAF';

let errorTimeout;

export async function registerIngameMessageHandler(bot: MyBot) {
    const wss = await getCurrentWebsocket();
    bot.on('message', (message: ChatMessage, type) => {
        const text = message.getText(null);
        if (type === 'chat') {
            printMcChatToConsole(message.toAnsi());
            if (text.startsWith('[Auction]') && text.includes('bought') && text.includes('for')) {
                log('New item sold');
                claimSoldItem(bot);

                const [buyer, price] = text.split(' bought ')[1].split(' for ');
                const itemName = text.split('[Auction] ')[1].split(' bought ')[0];
                sendWebhookItemSold(buyer, price.split(' coins')[0], itemName);
            }
            if (bot.privacySettings?.chatRegex.test(text)) {
                wss.send(JSON.stringify({ type: 'chatBatch', data: JSON.stringify([text]) }));
            }
        }
    });
    setNothingBoughtFor1HourTimeout(wss);
}

export function claimPurchased(bot: MyBot, useCollectAll = true): Promise<boolean> {
    return new Promise((resolve) => {
        if (bot.state) {
            log(`Currently busy with something else (${bot.state}) -> not claiming purchased item`);
            setTimeout(async () => resolve(await claimPurchased(bot)), 950);
            return;
        }
        bot.state = 'claiming';
        bot.chat('/ah');

        const timeout = setTimeout(() => {
            log('Claiming of purchased auction failed. Removing lock');
            bot.state = null;
            resolve(false);
        }, 4750);

        bot.once('windowOpen', async (window) => {
            const title = getWindowTitle(window);
            log(`Claiming auction window: ${title}`);

            if (title.includes('Auction House')) {
                clickWindow(bot, 13);
            }

            if (title.includes('Your Bids')) {
                let slotToClick = -1;
                for (let i = 0; i < window.slots.length; i++) {
                    const slot = window.slots[i];
                    if (slot && typeof slot === 'object' && 'nbt' in slot && slot.nbt && typeof slot.nbt === 'object') {
                        const name = slot.nbt.value?.display?.value?.Name?.value;
                        if (useCollectAll && slot?.type === 380 && name?.includes('Claim') && name?.includes('All')) {
                            log(`Found cauldron to claim all purchased auctions -> clicking index ${i}`);
                            clickWindow(bot, i);
                            clearTimeout(timeout);
                            bot.state = null;
                            resolve(true);
                            return;
                        }
                        const lore = slot.nbt.value?.display?.value?.Lore?.value?.toString();
                        if (lore?.includes('Status:') && lore?.includes('Sold!')) {
                            log(`Found claimable purchased auction. Gonna click index ${i}`);
                            slotToClick = i;
                        }
                    }
                }

                if (slotToClick === -1) {
                    log('No claimable purchased auction found');
                    clearTimeout(timeout);
                    bot.state = null;
                    bot.closeWindow(window);
                    resolve(false);
                    return;
                }
                clickWindow(bot, slotToClick);
            }

            if (title.includes('BIN Auction View')) {
                log('Claiming purchased auction...');
                clickWindow(bot, 31);
                clearTimeout(timeout);
                bot.state = null;
                resolve(true);
            }
        });
    });
}

export async function claimSoldItem(bot: MyBot): Promise<boolean> {
    return new Promise((resolve) => {
        if (bot.state) {
            log(`Currently busy with something else (${bot.state}) -> not claiming sold item`);
            setTimeout(async () => resolve(await claimSoldItem(bot)), 985);
            return;
        }

        const timeout = setTimeout(() => {
            log('Seems something went wrong while claiming sold item. Removing lock');
            bot.state = null;
            resolve(false);
        }, 9850);

        bot.state = 'claiming';
        bot.chat('/ah');

        bot.once('windowOpen', (window) => {
            const title = getWindowTitle(window);
            if (title.includes('Auction House')) {
                clickWindow(bot, 15);
            }
            if (title.includes('Manage Auctions')) {
                log('Claiming sold auction...');
                let clickSlot;

                for (const slot of window.slots) {
                    if (slot && typeof slot === 'object' && 'nbt' in slot && slot.nbt && typeof slot.nbt === 'object') {
                        const lore = slot.nbt.value?.display?.value?.Lore;
                        if (lore && JSON.stringify(lore).includes('Sold for')) {
                            clickSlot = slot.slot;
                        }
                        const name = slot.nbt.value?.display?.value?.Name?.value?.toString();
                        if (slot && slot.name === 'cauldron' && name?.includes('Claim All')) {
                            log(`Found cauldron to claim all sold auctions -> clicking index ${slot.slot}`);
                            clickWindow(bot, slot.slot);
                            clearTimeout(timeout);
                            bot.state = null;
                            resolve(true);
                            return;
                        }
                    }
                }

                if (!clickSlot) {
                    log('No sold auctions found');
                    printMcChatToConsole('§f[§4BAF§f]: §l§cSomething is wrong while trying to claim sold auctions. Maybe not have auctions to claim!');
                    clearTimeout(timeout);
                    bot.state = null;
                    bot.closeWindow(window);
                    resolve(false);
                    return;
                }
                log(`Clicking auction to claim, index: ${clickSlot}`);
                clickWindow(bot, clickSlot);
            }
            if (title === 'BIN Auction View') {
                log('Clicking slot 31, claiming purchased auction');
                clickWindow(bot, 31);
                clearTimeout(timeout);
                bot.state = null;
                resolve(true);
            }
        });
    });
}

function setNothingBoughtFor1HourTimeout(wss: WebSocket) {
    if (errorTimeout) {
        clearTimeout(errorTimeout);
    }
    errorTimeout = setTimeout(() => {
        wss.send(JSON.stringify({ type: 'clientError', data: 'Nothing bought for 1 hour' }));
    }, 3600000); // 1 hour in milliseconds
}
