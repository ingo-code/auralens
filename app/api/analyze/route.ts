import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { StyleAnalysisSchema } from "@/lib/analysis-schema";
import { compressImageForAnalysis } from "@/lib/image-processing";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { saveAnalysis } from "@/lib/analyses";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"] as const);
type AllowedImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const RATE_LIMIT = {
  limit: Number(process.env.ANALYZE_RATE_LIMIT ?? 10),
  windowMs: Number(process.env.ANALYZE_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000), // 10 min
};

const client = new Anthropic();

const SYSTEM_PROMPT =
  "Du bist AuraLens, ein KI-gestützter visueller Stil- und Storytelling-Analyst für " +
  "Fotografen und Kreative. Analysiere das übergebene Bild präzise, professionell und " +
  "auf Deutsch.";

const USER_PROMPT =
  "Analysiere den visuellen Stil, die dominante Farbpalette (als Hex-Codes) und die " +
  "vermittelten Emotionen dieses Bildes. Formuliere daraus außerdem einen " +
  "einsatzbereiten Bildgenerierungs-Prompt für ChatGPT (DALL-E 3) als direkte Anfrage " +
  "in natürlicher, fließender Sprache (statt Parameter-Flags oder Schlagwortlisten), " +
  "mit dem sich ein stilistisch ähnliches Bild erzeugen ließe.";

export async function POST(request: NextRequest) {
  const clientId = getClientIdentifier(request.headers);
  const rateLimit = checkRateLimit(`analyze:${clientId}`, RATE_LIMIT);

  if (!rateLimit.success) {
    const retryAfterSeconds = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warte kurz, bevor du es erneut versuchst." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Ungültige Anfrage: Erwartet wird multipart/form-data mit einem Bild." },
      { status: 400 }
    );
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Kein Bild gefunden. Bitte ein Bild unter dem Feld 'image' senden." },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.has(file.type as AllowedImageType)) {
    return NextResponse.json(
      {
        error: `Nicht unterstützter Dateityp: ${file.type || "unbekannt"}. Erlaubt sind JPEG, PNG, WEBP und GIF.`,
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Das Bild ist zu groß. Maximale Größe: 10 MB." },
      { status: 413 }
    );
  }

  let image: Awaited<ReturnType<typeof compressImageForAnalysis>>;
  try {
    const originalBuffer = Buffer.from(await file.arrayBuffer());
    image = await compressImageForAnalysis(originalBuffer);
  } catch (error) {
    console.error("Bildverarbeitung fehlgeschlagen:", error);
    return NextResponse.json(
      { error: "Das Bild konnte nicht verarbeitet werden. Bitte ein anderes Bild versuchen." },
      { status: 400 }
    );
  }

  const base64Data = image.data.toString("base64");

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mediaType,
                data: base64Data,
              },
            },
            { type: "text", text: USER_PROMPT },
          ],
        },
      ],
      output_config: {
        format: zodOutputFormat(StyleAnalysisSchema),
      },
    });

    if (!response.parsed_output) {
      return NextResponse.json(
        { error: "Die Antwort der Claude API konnte nicht als strukturierter Report geparst werden." },
        { status: 502 }
      );
    }

    let persisted = false;
    try {
      const supabase = await createClient();
      const { data: claims } = await supabase.auth.getClaims();
      const userId = claims?.claims.sub;
      if (userId) {
        persisted = await saveAnalysis(supabase, userId, image.data, response.parsed_output);
      }
    } catch (persistError) {
      console.error("Persistenz der Analyse übersprungen:", persistError);
    }

    return NextResponse.json({ report: response.parsed_output, persisted });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Claude API Authentifizierungsfehler:", error.message);
      return NextResponse.json(
        { error: "Authentifizierung bei der Claude API fehlgeschlagen. Bitte ANTHROPIC_API_KEY prüfen." },
        { status: 500 }
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Rate-Limit der Claude API erreicht. Bitte später erneut versuchen." },
        { status: 429 }
      );
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error("Claude API Bad Request:", error.message);
      return NextResponse.json(
        { error: "Das Bild konnte nicht verarbeitet werden. Bitte ein anderes Bild versuchen." },
        { status: 400 }
      );
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Claude API Fehler:", error.status, error.message);
      return NextResponse.json({ error: "Die Claude API ist derzeit nicht erreichbar." }, { status: 502 });
    }
    if (error instanceof Anthropic.AnthropicError) {
      // The SDK throws this same generic error both for missing/invalid
      // credentials and for a model response that fails structured-output
      // validation (e.g. a malformed hex code) - distinguish by message so
      // a transient parse hiccup isn't reported as a config problem.
      if (error.message.includes("Failed to parse structured output")) {
        console.error("Strukturierte Antwort ungültig:", error.message);
        return NextResponse.json(
          { error: "Die KI-Antwort war ungültig formatiert. Bitte versuche es erneut." },
          { status: 502 }
        );
      }
      console.error("Anthropic SDK Konfigurationsfehler:", error.message);
      return NextResponse.json(
        { error: "Die Claude API ist nicht konfiguriert. Bitte ANTHROPIC_API_KEY in .env.local setzen." },
        { status: 500 }
      );
    }

    console.error("Unerwarteter Fehler bei der Bildanalyse:", error);
    return NextResponse.json({ error: "Unerwarteter Fehler bei der Bildanalyse." }, { status: 500 });
  }
}
