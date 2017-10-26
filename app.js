#!/usr/bin/env nodejs
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
let human = require('human-time');
let humanize = require('humanize');
const jsdom = require("jsdom");
const {JSDOM} = jsdom;


let CACHE = new Set();

let CHATS = new Set();

function fetchRegular() {
    getCourses(function (data) {
        let hasNew = new Set([...data].filter(x => !CACHE.has(x))).size > 0;
        if (hasNew) {
            CACHE = new Set(data);
            fs.writeFile("cache", JSON.stringify(data), function (err) {
                if (err) {
                    return console.log(err);
                }
                console.log("The file was saved!");
            });
            let lastDate = findLastDate(data);
            CHATS.forEach((e) => {
                bot.sendMessage(e, `Новые официальные фото: <a href="http://zilart.ru/construction">${findLastDate(data)}</a>`, {parse_mode: 'HTML'});
            });
        }
    });
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


let getCourses = function (action, chatId) {
    http.get('http://zilart.ru/construction', (res) => {
        let dataString = "";
        res.on('data', (d) => {
            dataString += d;
        });
        res.on('end', (d) => {
            const dom = new JSDOM(dataString);
            try {
                let dateStrings = Array.from(dom.window.document.querySelectorAll('.construction_item > .carousel_item_title')).map(e => e.textContent);
                Array.from(dom.window.document.querySelectorAll('.constr_dates_frame')[0].querySelectorAll('.constr_date')).map(e => {
                    http.get(`http://zilart.ru${e['href']}`, (res) => {
                        let dataString = "";
                        res.on('data', (d) => {
                            dataString += d;
                        });
                        res.on('end', (d) => {
                            const dom = new JSDOM(dataString);
                            let script = Array.from(dom.window.document.querySelectorAll('script')).filter(e => e.text.includes('constr_images'))[0].text;
                        });
                    });

                });
                action(dateStrings);
            } catch (e) {
                console.warn("Couldn't parse html: ", e);
                if (chatId) {
                    bot.sendMessage(chatId, "Couldn't parse html: " + e)
                }
            }
        });

    }).on('error', (e) => {
        console.error(e);
    });
};
let elementsToMessage = function (messages) {
    return messages.sort((one, other) => one.realStartDate - other.realStartDate).map(sessionToString).join('\n\n');
};
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    addNewChat(chatId);

    bot.sendMessage(chatId, 'Проверяю...');
    getCourses(data =>{
        bot.sendMessage(chatId, `Последние фото: <a href="http://zilart.ru/construction">${findLastDate(data)}</a>`, {parse_mode: 'HTML'});
        for (let i = 1; i < 5; i++) {
            bot.sendPhoto(chatId, `http://zilart.ru/public/images/construction/2017.09/6/${i}.jpg`);

        }
    }, chatId);


});

function findLastDate(data) {
    let values = data.map(el => {
        let split = el.split('.');
        return +(split[1] + split[0])
    }).sort();
    let last = '' + values[values.length - 1];
    return last.slice(4, 6) + '.' + last.slice(0, 4)
}

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

