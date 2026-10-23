export function GET() {
  return new Response("Você não tem acesso a esta área.", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
