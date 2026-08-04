export default function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "https://rundatesj.github.io");
  response.setHeader("Cache-Control", "no-store");
  return response.status(200).json({ ok: true, platform: "vercel" });
}
