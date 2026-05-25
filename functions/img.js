/**
 * 图片代理 - Cloudflare Pages Function
 *
 * 解决部分图床（如 imagetwist.com）被墙导致图片无法加载的问题。
 * 通过 Cloudflare 边缘网络代理加载图片。
 *
 * 用法: /img?url=https://img34.imagetwist.com/xxx.jpg
 */
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const imageUrl = url.searchParams.get('url');

    if (!imageUrl) {
        return new Response('Missing "url" parameter', { status: 400 });
    }

    // 只代理图片请求，防止滥用
    const decodedUrl = decodeURIComponent(imageUrl);
    if (!decodedUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i)) {
        return new Response('Only image URLs are allowed', { status: 400 });
    }

    try {
        const response = await fetch(decodedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://acgyx.us/',
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9',
            },
        });

        if (!response.ok) {
            return new Response('Failed to fetch image: ' + response.status, { status: response.status });
        }

        // 透传 content-type
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const contentLength = response.headers.get('content-length');

        // 构建响应头（允许缓存 7 天）
        const headers = {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=604800, s-maxage=86400',
            'Access-Control-Allow-Origin': '*',
        };
        if (contentLength) {
            headers['Content-Length'] = contentLength;
        }

        return new Response(response.body, {
            status: response.status,
            headers: headers,
        });
    } catch (error) {
        return new Response('Proxy error: ' + error.message, { status: 502 });
    }
}
