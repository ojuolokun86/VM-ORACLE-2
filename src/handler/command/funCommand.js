const axios = require('axios');
const fs = require('fs');
const tmp = require('tmp');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const sendToChat = require('../../utils/sendToChat');

// ✅ Helper: Get target user from reply or mention
function getTargetUser(msg, args) {
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    if (contextInfo?.participant) return contextInfo.participant;
    if (args[0]) return args[0].includes('@') ? args[0] : `${args[0]}@s.whatsapp.net`;
    return null;
}

// ✅ Convert image to WebP (for static sticker)
async function toWebpStickerBuffer(imageBuffer) {
    return sharp(imageBuffer)
        .resize(512, 512, { fit: 'inside' })
        .webp()
        .toBuffer();
}

// ✅ Convert GIF to animated WebP sticker
async function gifToAnimatedStickerBuffer(gifBuffer) {
    return new Promise((resolve, reject) => {
        const inputFile = tmp.tmpNameSync({ postfix: '.gif' });
        const outputFile = tmp.tmpNameSync({ postfix: '.webp' });
        fs.writeFileSync(inputFile, gifBuffer);

        ffmpeg(inputFile)
            .outputOptions([
                '-vcodec', 'libwebp',
                '-vf', "scale=320:320:force_original_aspect_ratio=decrease,fps=15,pad=320:320:(ow-iw)/2:(oh-ih)/2:color=white@0.0,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse",
                '-loop', '0'
            ])
            .toFormat('webp')
            .save(outputFile)
            .on('end', () => {
                const webp = fs.readFileSync(outputFile);
                fs.unlinkSync(inputFile);
                fs.unlinkSync(outputFile);
                resolve(webp);
            })
            .on('error', err => {
                fs.unlinkSync(inputFile);
                reject(err);
            });
    });
}

// ✅ Fetch a random GIF for action commands
async function fetchGiphyActionGif(action) {
    //console.log('Fetching GIF for action: ' + action);
    try {
        const res = await axios.get('https://api.giphy.com/v1/gifs/search', {
            params: {
                api_key: 'C5XVeQxRFvdVEXvO1qKN33E7cmvQss2n',
                q: action,
                limit: 20,
                rating: 'g'
            }
        });
        if (!res.data.data.length) return null;

        const randomGif = res.data.data[Math.floor(Math.random() * res.data.data.length)];
        const gifUrl = randomGif.images.original.url;
        const imgRes = await axios.get(gifUrl, { responseType: 'arraybuffer' });
        //console.log('GIF fetched for action: ' + action);

        return Buffer.from(imgRes.data);
    } catch (err) {
        console.log('Failed to fetch GIF for action: ' + action, err.message);
        return null;
    }
}

// ✅ Handle fun actions (slap, hug, etc.) as stickers
async function handleFunAction(sock, msg, command, args) {
    //console.log('Handling fun action: ' + command);
    const from = msg.key.remoteJid;
    const target = getTargetUser(msg, args);
    const senderId = msg.key.participant || msg.key.remoteJid;
    const mentions = target ? [senderId, target] : [senderId];

    const gifBuffer = await fetchGiphyActionGif(command);
    if (!gifBuffer) return;

    const webpBuffer = await gifToAnimatedStickerBuffer(gifBuffer);
    await sock.sendMessage(from, { sticker: webpBuffer, mentions }, { quoted: msg });
}

// ✅ Main fun command handler
async function funCommand(sock, from, msg, textMsg) {
    //console.log('Calling fun command');
    try {
        const args = textMsg.trim().split(/\s+/);
        const command = args.shift().toLowerCase();

        switch (command) {
            case 'quote': {
                const res = await axios.get('https://zenquotes.io/api/random');
                const data = res.data[0];
                await sendToChat(sock, from, {
                    message: `💬 *Quote of the Moment*\n\n"${data.q}"\n\n— _${data.a}_`
                }, { quoted: msg });
                break;
            }

            case 'joke': {
                const res = await axios.get('https://v2.jokeapi.dev/joke/Any?blacklistFlags=nsfw,religious,political,racist,sexist,explicit');
                const joke = res.data.type === 'single' ? res.data.joke : `${res.data.setup}\n${res.data.delivery}`;
                await sendToChat(sock, from, {
                    message: `😂 *Joke of the Moment*\n\n${joke}`
                }, { quoted: msg });
                break;
            }

            case 'translate': {
                const [targetLang, ...textArr] = args;
                const text = textArr.join(' ');
                if (!targetLang || !text) {
                    await sendToChat(sock, from, {
                        message: '❌ Usage: .translate <lang_code> <text>'
                    }, { quoted: msg });
                    break;
                }
                const res = await axios.post('https://libretranslate.de/translate', {
                    q: text, source: 'auto', target: targetLang, format: 'text'
                }, { headers: { accept: 'application/json' } });
                await sendToChat(sock, from, {
                    message: `🌐 *Translated (${targetLang}):*\n${res.data.translatedText}`
                }, { quoted: msg });
                break;
            }

            // ✅ Fun actions as animated stickers
            case 'slap': case 'hug': case 'kick': case 'poke': case 'tickle':
            case 'cry': case 'pat': case 'kill': case 'kiss': case 'wave':
            case 'blush': case 'shrug': case 'smile': case 'laugh':
            case 'lick': case 'bored': case 'stare': case 'yeet': case 'feed':
            case 'dance': case 'cuddle': case 'highfive': case 'facepalm':
            case 'thumbsup': case 'think': case 'shoot': case 'pout':
            case 'bite': case 'smug': case 'baka': {
                await handleFunAction(sock, msg, command, args);
                break;
            }

            default:
                await sendToChat(sock, from, {
                    message: '❌ Unknown fun command.'
                }, { quoted: msg });
                break;
        }
    } catch (err) {
        console.error('❌ Error in fun command:', err);
        await sendToChat(sock, from, {
            message: '❌ An error occurred while processing the fun command.'
        }, { quoted: msg });
    }
}

module.exports = funCommand;
