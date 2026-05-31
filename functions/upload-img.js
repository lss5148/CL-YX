/**
 * Telegram 图床上传代理 — Cloudflare Pages Function
 *
 * 接收前端上传的图片，转发到 Telegram Bot API 存储，
 * 返回可直接引用的直链 URL。
 *
 * 前置准备：
 *   1. 在 @BotFather 创建 Bot，获取 TOKEN
 *   2. 在 Telegram 创建私密频道，把 Bot 加为管理员
 *   3. 获取频道 ID：发一条消息到频道，然后访问
 *      https://api.telegram.org/bot<TOKEN>/getUpdates
 *      在返回的 JSON 中找到 "chat":{"id":-100xxxxxxxxxx}
 *
 * 使用方式：
 *   POST /upload-img
 *   Body: FormData { file: File, token: string, chatId: string }
 *
 * 返回：
 *   { "ok": true, "url": "https://api.telegram.org/file/bot.../..." }
 */

// 允许的图片 MIME 类型
const ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
];

// 最大文件大小：10MB
const MAX_SIZE = 10 * 1024 * 1024;

export async function onRequest(context) {
    // CORS 预检
    if (context.request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    if (context.request.method !== 'POST') {
        return jsonResponse({ ok: false, error: '仅支持 POST 请求' }, 405);
    }

    try {
        const formData = await context.request.formData();
        const file = formData.get('file');
        const token = formData.get('token') || context.env?.TG_BOT_TOKEN;
        const chatId = formData.get('chatId') || context.env?.TG_CHANNEL_ID;

        if (!file || !token || !chatId) {
            return jsonResponse({ ok: false, error: '缺少必要参数: file, token, chatId' }, 400);
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return jsonResponse({ ok: false, error: `不支持的文件类型: ${file.type}。支持: ${ALLOWED_TYPES.join(', ')}` }, 400);
        }

        if (file.size > MAX_SIZE) {
            return jsonResponse({ ok: false, error: `文件过大(${(file.size/1024/1024).toFixed(1)}MB)，最大 ${MAX_SIZE/1024/1024}MB` }, 400);
        }

        // 步骤1：发送图片到 Telegram 频道
        const tgForm = new FormData();
        tgForm.append('chat_id', chatId);
        tgForm.append('photo', file);
        tgForm.append('disable_notification', 'true');

        const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
            method: 'POST',
            body: tgForm,
        });

        const sendData = await sendRes.json();

        if (!sendData.ok) {
            return jsonResponse({
                ok: false,
                error: `Telegram 上传失败: ${sendData.description || '未知错误'}`,
                detail: sendData,
            }, 502);
        }

        // 步骤2：获取文件路径
        // 取最大的 photo size（最高画质）
        const photos = sendData.result.photo;
        const largestPhoto = photos.reduce((max, p) => p.file_size > max.file_size ? p : max, photos[0]);
        const fileId = largestPhoto.file_id;

        const getFileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
        const getFileData = await getFileRes.json();

        if (!getFileData.ok || !getFileData.result.file_path) {
            return jsonResponse({
                ok: false,
                error: `获取文件路径失败: ${getFileData.description || '未知错误'}`,
            }, 502);
        }

        const filePath = getFileData.result.file_path;
        const directUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

        return jsonResponse({
            ok: true,
            url: directUrl,
            // 额外信息
            fileId: fileId,
            width: largestPhoto.width,
            height: largestPhoto.height,
            size: largestPhoto.file_size,
            // 同时返回消息链接（可以直接打开查看）
            messageLink: `https://t.me/c/${chatId.replace('-100', '')}/${sendData.result.message_id}`,
        });

    } catch (error) {
        return jsonResponse({ ok: false, error: `服务器错误: ${error.message}` }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
        },
    });
}
