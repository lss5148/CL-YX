/**
 * Telegram 图床上传 — 支持批量上传
 * POST /upload-img  with FormData: files[], token, chatId
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
            return json({ ok: true, message: 'Upload API v4 (batch)' });
        }
        if (context.request.method !== 'POST') {
            return json({ ok: false, error: 'POST required' }, 405);
        }

        const formData = await context.request.formData();
        const token = (formData.get('token') || '').trim();
        const chatId = (formData.get('chatId') || '').trim();

        if (!token || token.length < 10) return json({ ok: false, error: 'Token 无效' }, 400);
        if (!chatId || !chatId.startsWith('-100')) return json({ ok: false, error: '频道 ID 应以 -100 开头' }, 400);

        // 获取所有文件（支持 files[] 和 file）
        let files = formData.getAll('files');
        if (files.length === 0) {
            const single = formData.get('file');
            if (single && single.size > 0) files = [single];
        }
        if (files.length === 0) return json({ ok: false, error: '没有选择文件' }, 400);

        const results = [];
        for (const file of files) {
            const entry = { name: file.name, size: file.size };
            try {
                const tgForm = new FormData();
                tgForm.append('chat_id', chatId);
                tgForm.append('photo', file, file.name);
                tgForm.append('disable_notification', 'true');

                const r1 = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: tgForm });
                const d1 = await r1.json();

                if (!d1.ok) {
                    entry.error = d1.description || '发送失败';
                } else {
                    const photos = d1.result.photo || [];
                    const big = photos.reduce((a, b) => (b.file_size || 0) > (a.file_size || 0) ? b : a, photos[0] || {});
                    const r2 = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${big.file_id}`);
                    const d2 = await r2.json();
                    if (d2.ok && d2.result.file_path) {
                        entry.url = `https://api.telegram.org/file/bot${token}/${d2.result.file_path}`;
                        entry.width = big.width;
                        entry.height = big.height;
                        entry.ok = true;
                    } else {
                        entry.error = '获取直链失败: ' + (d2.description || '');
                    }
                }
            } catch (e) {
                entry.error = e.message;
            }
            results.push(entry);
        }

        const okCount = results.filter(r => r.ok).length;
        return json({
            ok: okCount > 0,
            total: results.length,
            okCount,
            failCount: results.length - okCount,
            results,
        });

    } catch (error) {
        return json({ ok: false, error: '服务器异常: ' + (error?.message || 'unknown') }, 500);
    }
}

function json(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' },
    });
}
