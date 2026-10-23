// Vercel Serverless Function: /api/registrations
// This function fetches the upstream Google Apps Script data server-side.

const UPSTREAM_URL = process.env.REGISTRATION_API_URL;

function extractJsonp(body, callbackName) {
  const trimmed = body.trim();
  const prefix = callbackName + "(";

  const withoutSemicolon = trimmed.endsWith(";")
    ? trimmed.slice(0, -1).trim()
    : trimmed;

  if (!withoutSemicolon.startsWith(prefix) || !withoutSemicolon.endsWith(")")) {
    throw new Error("Unexpected response format from registration service");
  }

  // Strip only the callback wrapper; JSON.parse validates the payload.
  const jsonText = withoutSemicolon.slice(prefix.length, -1).trim();
  return JSON.parse(jsonText);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  if (!UPSTREAM_URL) {
    console.error("Missing REGISTRATION_API_URL environment variable");
    return res.status(500).json({
      success: false,
      message: "Registration API is not configured"
    });
  }

  const callbackName = "vercelRegistrationCallback";

  try {
    const upstreamUrl = new URL(UPSTREAM_URL);
    upstreamUrl.searchParams.set("callback", callbackName);
    upstreamUrl.searchParams.set("_", String(Date.now()));

    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/javascript, text/javascript, application/json" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow"
    });

    if (!upstreamResponse.ok) {
      throw new Error("Upstream service returned HTTP " + upstreamResponse.status);
    }

    const body = await upstreamResponse.text();
    const data = extractJsonp(body, callbackName);

    if (!data || data.success !== true) {
      throw new Error("Registration service returned unsuccessful data");
    }

    // Return only the fields the dashboard uses.
    return res.status(200).json({
      success: true,
      totalRegistrations: Number(data.totalRegistrations) || 0,
      sports: Array.isArray(data.sports) ? data.sports : [],
      badmintonEvents: Array.isArray(data.badmintonEvents) ? data.badmintonEvents : [],
      updatedAt: data.updatedAt || new Date().toISOString()
    });
  } catch (error) {
    console.error("Registration API error:", error.message);
    return res.status(502).json({
      success: false,
      message: "Unable to retrieve registration data"
    });
  }
}
