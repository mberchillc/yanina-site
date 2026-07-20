export async function onRequest(context) {
  const response = await context.env.ASSETS.fetch(context.request);
  const headers = new Headers(response.headers);
  const contentType = headers.get("content-type") || "";
  if (contentType.includes("text/html")) headers.set("cache-control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
