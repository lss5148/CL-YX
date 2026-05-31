/**
 * 纯测试版：只接收并回显文件信息，不连 Telegram
 * 用于确认 Cloudflare Pages Functions 能否正常接收文件上传
 */
export async function onRequest(context) {
    try {
        if (context.request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Max-Age': '86400',
                },
            });
        }

        if (context.request.method === 'GET') {
            return json({ ok: true, message: 'Upload API v3 (test mode)' });
        }

        if (context.request.method !== 'POST') {
            return json({ ok: false, error: 'POST required' }, 405);
        }

        const ct = context.request.headers.get('content-type') || '';
        const cl = context.request.headers.get('content-length') || '0';

        // 尝试解析 FormData
        let formData;
        try {
            formData = await context.request.formData();
        } catch (e) {
            return json({
                ok: false,
                error: 'FormData 解析失败: ' + e.message,
                contentType: ct,
                contentLength: cl,
            }, 400);
        }

        const file = formData.get('file');
        const token = formData.get('token') || '';
        const chatId = formData.get('chatId') || '';

        const result = {
            ok: true,
            mode: 'test',
            message: '文件接收成功！',
            file: file ? {
                name: file.name,
                type: file.type,
                size: file.size,
                sizeKB: (file.size / 1024).toFixed(1) + 'KB',
            } : null,
            hasToken: !!token,
            tokenLen: token.length,
            hasChatId: !!chatId,
            chatIdValue: chatId,
            contentType: ct,
            contentLength: cl,
        };

        // 如果 token 和 chatId 都有效，才尝试发送到 Telegram
        if (token && token.length > 10 && chatId && chatId.startsWith('-100') && file && file.size > 0) {
            result.mode = 'forwarding';
            try {
                const tgForm = new FormData();
                tgForm.append('chat_id', chatId);
                tgForm.append('photo', file, file.name);
                tgForm.append('disable_notification', 'true');

                const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
                    method: 'POST',
                    body: tgForm,
                });
                const tgData = await tgRes.json();

                if (tgData.ok) {
                    const photos = tgData.result.photo || [];
                    const largest = photos.reduce((a, b) => (b.file_size || 0) > (a.file_size || 0) ? b : a, photos[0] || {});
                    const gfRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${largest.file_id}`);
                    const gfData = await gfRes.json();
                    if (gfData.ok && gfData.result.file_path) {
                        result.url = `https://api.telegram.org/file/bot${token}/${gfData.result.file_path}`;
                        result.width = largest.width;
                        result.height = largest.height;
                        result.tg_size = largest.file_size;
                        result.mode = 'success';
                    } else {
                        result.mode = 'getFile_failed';
                        result.tgError = gfData;
                    }
                } else {
                    result.mode = 'sendPhoto_failed';
                    result.tgError = tgData;
                }
            } catch (tgErr) {
                result.mode = 'tg_network_error';
                result.error = tgErr.message;
            }
        }

        return json(result);

    } catch (error) {
        return json({ ok: false, error: 'Outer catch: ' + (error?.message || 'unknown') }, 500);
    }
}

function json(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
        },
    });
}
