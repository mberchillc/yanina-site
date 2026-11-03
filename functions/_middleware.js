export async function onRequest(context) {
  const response = await context.next();
  const path = new URL(context.request.url).pathname;
  if (!/^\/(superadmin|alumno|student)(\/|$)/.test(path) || !(response.headers.get('content-type') || '').includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
