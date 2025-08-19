const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const execAsync = promisify(exec);

const MAX_VIDEO_SIZE_MB = 1120; // WhatsApp limit
const TMP_DIR = path.join(__dirname, '../../tmp');

if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

async function downloadVideo(sock, from, msg, args) {
    console.log('[video] Command started');

    const url = args[0];
    if (!url) {
        return await sock.sendMessage(from, { text: '❌ Please provide a video URL.\nExample: .video https://youtube.com/...' });
    }

    // Validate URL
    try {
        new URL(url);
    } catch (e) {
        return await sock.sendMessage(from, { text: '❌ Invalid URL. Please provide a valid video URL.' });
    }

    const tempFile = path.join(TMP_DIR, `temp_${Date.now()}.%(ext)s`);
    let command = `yt-dlp --no-check-certificate \
        --geo-bypass-country US \
        --user-agent "Mozilla/5.0" \
        -f "mp4" \
        --merge-output-format mp4 \
        --no-playlist \
        -o "${tempFile}" \
        "${url}"`;

    //console.log(`[video] Starting download: ${url}`);

    try {
        await sock.sendMessage(from, {
            text: '⏳ *Downloading video...*\nPlease wait...',
            mentions: [msg.key.participant || msg.key.remoteJid]
        });

        // Run yt-dlp command
        const { stdout, stderr } = await execAsync(command);
        //console.log('[video] yt-dlp output:', stdout || stderr);

        // Find downloaded .mp4 file
        const downloadedFiles = fs.readdirSync(TMP_DIR).filter(file => file.startsWith('temp_') && file.endsWith('.mp4'));
        if (downloadedFiles.length === 0) {
            throw new Error('Download failed: No MP4 file was created');
        }
        const actualFile = path.join(TMP_DIR, downloadedFiles[0]);

        // Check size
        let stats = fs.statSync(actualFile);
        let fileSizeMB = stats.size / (1024 * 1024);

        // If too large, retry with lower quality
        if (fileSizeMB > MAX_VIDEO_SIZE_MB) {
            //console.log(`[video] File too large (${fileSizeMB.toFixed(2)}MB). Retrying with lower quality...`);
            fs.unlinkSync(actualFile);

            const lowQualityCmd = `yt-dlp --no-check-certificate \
                --user-agent "Mozilla/5.0" \
                -f "best[ext=mp4][height<=480]" \
                --merge-output-format mp4 \
                --no-playlist \
                -o "${tempFile}" \
                "${url}"`;

            const { stdout: lowOut, stderr: lowErr } = await execAsync(lowQualityCmd);
            //console.log('[video] Low quality yt-dlp output:', lowOut || lowErr);

            const newFiles = fs.readdirSync(TMP_DIR).filter(file => file.startsWith('temp_') && file.endsWith('.mp4'));
            if (newFiles.length === 0) throw new Error('Failed even after retrying with low quality');

            const newActualFile = path.join(TMP_DIR, newFiles[0]);
            stats = fs.statSync(newActualFile);
            fileSizeMB = stats.size / (1024 * 1024);
        }

        const videoBuffer = fs.readFileSync(actualFile);

        await sock.sendMessage(from, {
            video: videoBuffer,
            mimetype: 'video/mp4',
            caption: `⬇️ *Downloaded by BMM-BOT*\n📏 Size: ${fileSizeMB.toFixed(2)}MB`,
            fileName: `video_${Date.now()}.mp4`,
            gifPlayback: false,
            mentions: [msg.key.participant || msg.key.remoteJid]
        }, { quoted: msg });

        //console.log('[video] Video sent successfully');
    } catch (error) {
        console.error('[video] Error:', error);
        await sock.sendMessage(from, {
            text: '❌ Failed to download video. ' + (error.message || 'Please try again later.'),
            mentions: [msg.key.participant || msg.key.remoteJid]
        });
    } finally {
        // Clean up temp files
        try {
            const files = fs.readdirSync(TMP_DIR);
            files.forEach(file => {
                if (file.startsWith('temp_')) fs.unlinkSync(path.join(TMP_DIR, file));
            });
        } catch (cleanupError) {
            console.error('[video] Cleanup error:', cleanupError);
        }
    }
}

module.exports = { downloadVideo };
