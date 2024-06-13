import { Client } from 'minecraft-protocol';
import { logPacket } from './logger';
import { numberWithThousandsSeparators } from './utils';

let windowClicker;

export function getFastWindowClicker() {
    if (windowClicker) {
        return windowClicker;
    }
    throw new Error('Window Clicker not created!');
}

export function createFastWindowClicker(client: Client) {
    let actionCounter = 1;
    let lastWindowId = 0;

    const createItem = (blockId: number, name: string, lore: string[]) => ({
        blockId,
        itemCount: 1,
        itemDamage: 0,
        nbtData: {
            type: 'compound',
            name: '',
            value: {
                overrideMeta: { type: 'byte', value: 1 },
                display: {
                    type: 'compound',
                    value: {
                        Lore: {
                            type: 'list',
                            value: {
                                type: 'string',
                                value: lore,
                            },
                        },
                        Name: { type: 'string', value: name },
                    },
                },
                AttributeModifiers: { type: 'list', value: { type: 'end', value: [] } },
            },
        },
    });

    const clickWindow = (windowId: number, slot: number, item: any) => {
        client.write('window_click', {
            windowId,
            slot,
            mouseButton: 0,
            action: actionCounter,
            mode: 0,
            item,
        });
        actionCounter += 1;
    };

    windowClicker = {
        clickPurchase: function (price: number, windowId: number) {
            const item = createItem(371, '§6Buy Item Right Now', [
                '',
                `§7Price: §6${numberWithThousandsSeparators(price)} coins`,
                '',
                '§eClick to purchase!',
            ]);
            clickWindow(windowId, 31, item);
        },
        clickBedPurchase: function (price: number, windowId: number) {
            const item = createItem(355, '§6Buy Item Right Now', [
                '',
                `§7Price: §6${numberWithThousandsSeparators(price)} coins`,
                '',
                '§cCan be bought soon!',
            ]);
            clickWindow(windowId, 31, item);
        },
        clickConfirm: function (price: number, itemName: string, windowId: number) {
            const item = createItem(159, '§aConfirm', [
                `§7Purchasing: §a§f§9${itemName.replace(/§/g, '§')}`,
                `§7Cost: §6${numberWithThousandsSeparators(Math.floor(price))} coins`,
            ]);
            clickWindow(windowId, 11, item);
        },
        getLastWindowId: function () {
            return lastWindowId;
        },
    };

    client.on('packet', function (packet, packetMeta) {
        if (packetMeta.name === 'open_window') {
            lastWindowId = packet.windowId;
        }
        logPacket(packet, packetMeta, false);
    });
}
