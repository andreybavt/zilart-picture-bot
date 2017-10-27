#!/usr/bin/env nodejs
"use strict";
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
let human = require('human-time');
let humanize = require('humanize');
const jsdom = require("jsdom");
const {JSDOM} = jsdom;
const request = require('request');


let CACHE = new Set();
const BASE_URL = 'http://zilart.ru';
let CHATS = new Set();

async function fetchRegular() {
    let pictureBatchesNames = await getPictureBatchesNames();
    let lastMonth = findLastDate([...pictureBatchesNames]);
    let hasNew = new Set([...pictureBatchesNames].filter(x => !CACHE.has(x))).size > 0;
    if (hasNew) {
        CACHE = pictureBatchesNames;
        fs.writeFileSync("cache", JSON.stringify([...pictureBatchesNames]), function (err) {
            if (err) {
                return console.log(err);
            }
            console.log("The file was saved!");
        });
        let pics = await withRetry(getPhotos);

        for (let e of CHATS) {
            await bot.sendMessage(e, `Новые официальные фото: <a href="http://zilart.ru/construction">${lastMonth}</a>`, {parse_mode: 'HTML'}).then();
            if (pics) {
                sendPicsToChat(pics, e);
            }
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, retry_count) {
    retry_count = retry_count || 0;
    try {
        if (retry_count > 10) {
            return null;
        } else {
            return await fn();
        }
    } catch (e) {
        console.error(new Date().toISOString(), 'withRetry', e);
        await sleep(retry_count * 1000 * 20);
        return withRetry(fn, retry_count + 1);
    }
}

const token = '389059717:AAHHvfkPzWI1U1_zTQFbvYIZHFundqAuw3g';
const bot = new TelegramBot(token, {polling: true});


// messages.
let addNewChat = function (chatId) {
    if (!CHATS.has(chatId)) {
        bot.sendMessage(chatId, 'Добавлен в апдейт лист :)');
        CHATS.add(chatId);
        fs.writeFile("chats", JSON.stringify(Array.from(CHATS)), function (err) {
            if (err) {
                return console.log(err);
            }
            console.log("The CHATS file was saved!");
        });
    }
};


function doGet(url) {
    return new Promise((resolve, reject) => {
        try {

            http.get(`http://zilart.ru${url}`, (res) => {
                let dataString = "";
                res.on('data', (d) => {
                    dataString += d;
                });
                res.on('end', (d) => {
                    resolve(dataString);
                });
            })
        } catch (e) {
            console.error('Get failed', e);
            reject(e);
        }
    });
}

let getPictureBatchesNames = async function () {
    const dataString = await doGet('/construction')
    const dom = new JSDOM(dataString);
    return new Set(Array.from(dom.window.document.querySelectorAll('.construction_item > .carousel_item_title')).map(e => e.textContent));
}

let getPhotos = async function (action) {
    return await doGet('/construction').then(dataString => {
        const dom = new JSDOM(dataString);
        let dateStrings = Array.from(dom.window.document.querySelectorAll('.construction_item > .carousel_item_title')).map(e => e.textContent);
        let lastMonthSection = dom.window.document.querySelector('.construction_item');
        let lastMonthText = lastMonthSection.querySelector('.carousel_item_title').textContent;

        let pictureBatches = Array.from(lastMonthSection.querySelectorAll('.constr_dates_frame .constr_date'));
        return Promise.all(pictureBatches.map(lotBatch => {
                return doGet(lotBatch['href']).then(dataString => {
                    const dom = new JSDOM(dataString, {
                        runScripts: "outside-only"
                    });
                    let script = Array.from(dom.window.document.querySelectorAll('script')).filter(e => e.text.includes('constr_images'))[0].text;
                    dom.window.eval(script);
                    let house_url = dom.window.document.querySelector('.gallery_place[data-path]').getAttribute('data-path');
                    let pic_urls = Object.keys(dom.window.constr_images);
                    return pic_urls.map(pic => {
                        return {lot: lotBatch.text, url: `${BASE_URL}${house_url}${pic}`}
                    });
                })
            })
        ).then(pics => {
            return {month: lastMonthText, pics: pics}
        });
    });
};
let elementsToMessage = function (messages) {
    return messages.sort((one, other) => one.realStartDate - other.realStartDate).map(sessionToString).join('\n\n');
};

async function sendPicsToChat(pics, chatId) {
    for (let i = 0; i < pics.pics.length; i++) {
        await Promise.all(pics.pics[i].map(pic => bot.sendPhoto(chatId, pic.url, {caption: `${pic.lot} - ${pics.month}`})));
    }
}

bot.on('message', async function (msg) {
    const chatId = msg.chat.id;
    addNewChat(chatId);

    bot.sendMessage(chatId, 'Проверяю...');
    let pics = await withRetry(getPhotos);
    if (pics) {
        await sendPicsToChat(pics, chatId);
    } else {
        bot.sendMessage(chatId, 'Не получилось проверить фото, попробуйте попозже.');
    }
});

function findLastDate(data) {
    let values = data.map(el => {
        let split = el.split('.');
        return +(split[1] + split[0])
    }).sort();
    let last = '' + values[values.length - 1];
    return last.slice(4, 6) + '.' + last.slice(0, 4)
}

!fs.existsSync('cache') && fs.writeFileSync('cache', JSON.stringify([]));
!fs.existsSync('chats') && fs.writeFileSync('chats', JSON.stringify([]));

fs.readFile("cache", 'utf8', function (err, d) {
    if (err) {
        console.log(err);
    } else {
        CACHE = new Set(JSON.parse(d));
    }
    fs.readFile("chats", 'utf8', function (err, d) {
        if (err) {
            console.log(err);
        } else {
            CHATS = new Set(JSON.parse(d));
        }
        setInterval(() => {
            if (Array.from(CHATS).length > 0) {
                fetchRegular();
            }
        }, 1000 * 60 * 5);
    });

});

