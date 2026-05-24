/**
 * Decap CMS OAuth - GitHub 回调处理
 * Cloudflare Pages Function
 */
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    if (!code) {
        return new Response('缺少 code 参数', { status: 400 });
    }

    const clientId = env.GITHUB_CLIENT_ID;
    const clientSecret = env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return new Response('GITHUB_CLIENT_ID 或 GITHUB_CLIENT_SECRET 未配置', { status: 500 });
    }

    // 用 code 换 access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
        }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
        return new Response(`GitHub OAuth 错误: ${tokenData.error_description || tokenData.error}`, { status: 400 });
    }

    // 返回给 Decap CMS 的 HTML 页面
    const content = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>登录成功</title>
</head>
<body>
    <p>登录成功，正在跳转回 CMS...</p>
    <script>
        (function() {
            var data = ${JSON.stringify(tokenData)};
            if (window.opener) {
                window.opener.postMessage(
                    { type: 'authorization', data: { token: data.access_token } },
                    '${url.origin}'
                );
                window.close();
            } else {
                document.body.innerHTML = '<p>认证成功，请关闭此窗口。</p>';
            }
        })();
    </script>
</body>
</html>`;

    return new Response(content, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}
