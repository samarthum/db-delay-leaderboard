// Vercel Function. Hands the browser a single-use ElevenLabs token for realtime speech to text, so the audio goes
// straight from the phone to ElevenLabs and the API key never leaves the server. The token works once and expires
// after 15 minutes. Needs ELEVENLABS_API_KEY in the project's environment variables.
//
// Same-origin check: a browser always sends Origin on a POST, so other websites cannot use this endpoint from a page.
// A script can fake the header, so this stops casual use only; the real ceiling is the spend cap on the ElevenLabs key.

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  // GET: "is voice search set up here?" The page asks once, and shows the microphone only when the answer is yes.
  if (req.method === "GET") return send(res, process.env.ELEVENLABS_API_KEY ? 200 : 503, { ok: Boolean(process.env.ELEVENLABS_API_KEY) });
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "method" });
  }
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(req.headers.origin) && new URL(req.headers.origin).host === req.headers.host;
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) return send(res, 403, { error: "origin" });

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return send(res, 503, { error: "not-configured" });
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
      method: "POST",
      headers: { "xi-api-key": key },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return send(res, 502, { error: "upstream", status: r.status });
    const { token } = await r.json();
    if (!token) return send(res, 502, { error: "upstream" });
    return send(res, 200, { token });
  } catch {
    return send(res, 502, { error: "upstream" });
  }
};
