const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== 'GET') return response;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/kb/')) return response;
    return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
  }
};

export default worker;
