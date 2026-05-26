/**
 * 通用 CORS 代理 - Cloudflare Pages Function
 *
 * 解决跨域问题，用于提取 acgyx.us 文章列表、导入文章等场景。
 * 通过 Cloudflare 边缘网络代理请求任意 URL。
 *
 * 用法: /proxy?url=https://acgyx.us/page/2/
 */
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing "url" parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }

    const decodedUrl = decodeURIComponent(targetUrl);

    try {
        const response = await fetch(decodedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://acgyx.us/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
        });

        if (!response.ok) {
            return new Response('Failed to fetch: ' + response.status, {
                status: response.status,
                headers: { 'Access-Control-Allow-Origin': '*' },
            });
        }

        // 透传 content-type
        const contentType = response.headers.get('content-type') || 'text/html';

        const headers = {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300', // 缓存 5 分钟
        };

        return new Response(response.body, {
            status: response.status,
            headers: headers,
        });
    } catch (error) {
        return new Response('Proxy error: ' + error.message, {
            status: 502,
            headers: { 'Access-Control-Allow-Origin': '*' },
        });
    }
}
