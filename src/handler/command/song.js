const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const tempDir = path.join(__dirname, '../../../temp/youtube-dl');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

async function downloadWithYtDlp(url) {
    return new Promise((resolve, reject) => {
        const outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');
        const cmd = `yt-dlp -x --audio-format mp3 --audio-quality 128k -o "${outputTemplate}" "${url}"`;

        exec(cmd, (error, stdout, stderr) => {
            if (error) return reject(stderr || error.message);
            // Find the downloaded file
            const match = stdout.match(/Destination: (.+\.mp3)/);
            if (match && fs.existsSync(match[1])) {
                resolve(match[1]);
            } else {
                reject('File not found after download');
            }
        });
    });
}

async function songCommand(sock, from, msg, { prefix, args }) {
    if (!args[0]) {
        return await sock.sendMessage(from, {
            text: `❌ Please provide a YouTube link.\nExample: *${prefix}song https://youtu.be/...*`
        }, { quoted: msg });
    }

    const url = args[0];
    await sock.sendMessage(from, { text: '⏳ Downloading song, please wait...' }, { quoted: msg });

    try {
        const filePath = await downloadWithYtDlp(url);
        const fileBuffer = fs.readFileSync(filePath);
        console.log('File downloaded:', filePath);
        console.log('File buffer:', fileBuffer);
        await sock.sendMessage(from, {
            audio: fileBuffer,
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName: path.basename(filePath)
        }, { quoted: msg });
        console.log('Audio sent:', filePath);

        // Cleanup
        fs.unlinkSync(filePath);
    } catch (error) {
        await sock.sendMessage(from, { text: `❌ Error: ${error}` }, { quoted: msg });
    }
}

module.exports = songCommand;
