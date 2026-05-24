/**
 * Decap CMS OAuth - GitHub 登录入口
 * Cloudflare Pages Function
 */
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    const clientId = env.GITHUB_CLIENT_ID;
    if (!clientId) {
        return new Response('GITHUB_CLIENT_ID 未配置', { status: 500 });
    }

    const redirectUri = `${url.origin}/api/callback`;

    const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
    githubAuthUrl.searchParams.set('client_id', clientId);
    githubAuthUrl.searchParams.set('redirect_uri', redirectUri);
    githubAuthUrl.searchParams.set('scope', 'repo,user');
    githubAuthUrl.searchParams.set('response_type', 'code');

    return Response.redirect(githubAuthUrl.toString(), 302);
}
