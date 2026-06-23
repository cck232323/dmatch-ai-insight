import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const SubScoreSchema = z.object({
  name: z.string(),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  note: z.string(),
});

const ReportSchema = z.object({
  subject_summary: z.string(),
  overall_truth_score: z.number().min(0).max(100),
  confidence_low: z.number().min(0).max(100),
  confidence_high: z.number().min(0).max(100),
  verdict: z.enum(["LIKELY_REAL", "MIXED_SIGNALS", "HIGH_RISK", "LIKELY_FAKE"]),
  sub_scores: z.array(SubScoreSchema).length(5),
  red_flags: z.array(z.string()),
  green_flags: z.array(z.string()),
  catfish_risk: z.number().min(0).max(100),
  ai_generated_photo_risk: z.number().min(0).max(100),
  recommendation: z.string(),
});

export type AnalysisReport = z.infer<typeof ReportSchema>;

const DEFAULT_SUB_SCORE_NAMES = [
  "Photo Authenticity",
  "AI-Generated Detection",
  "Identity Consistency",
  "Wealth & Status Signals",
  "Social Proof",
] as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function read(record: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function asText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function asScore(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value.replace("%", ""))
        : Number.NaN;
  return Math.round(Math.min(100, Math.max(0, Number.isFinite(parsed) ? parsed : fallback)));
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asText(item, ""))
      .filter(Boolean)
      .slice(0, 12);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n|;/)
      .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return [];
}

function normalizeVerdict(value: unknown, score: number): AnalysisReport["verdict"] {
  if (typeof value === "string") {
    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");
    if (
      normalized === "LIKELY_REAL" ||
      normalized === "MIXED_SIGNALS" ||
      normalized === "HIGH_RISK" ||
      normalized === "LIKELY_FAKE"
    ) {
      return normalized;
    }
  }
  if (score >= 80) return "LIKELY_REAL";
  if (score >= 60) return "MIXED_SIGNALS";
  if (score >= 40) return "HIGH_RISK";
  return "LIKELY_FAKE";
}

function unwrapReport(value: unknown): UnknownRecord {
  if (!isRecord(value)) return {};
  const nested = read(value, "report", "result", "analysis", "data");
  return isRecord(nested) ? nested : value;
}

/** Convert a best-effort model response into the stable shape required by the UI. */
export function normalizeAnalysisReport(value: unknown): AnalysisReport {
  const raw = unwrapReport(value);
  const rawSubScores = read(raw, "sub_scores", "subScores", "scores");
  const suppliedSubScores = Array.isArray(rawSubScores)
    ? rawSubScores.filter(isRecord).slice(0, DEFAULT_SUB_SCORE_NAMES.length)
    : [];

  const suppliedScores = suppliedSubScores.map((item) => asScore(read(item, "score", "value"), 50));
  const inferredOverall = suppliedScores.length
    ? suppliedScores.reduce((sum, score) => sum + score, 0) / suppliedScores.length
    : 50;
  const overall = asScore(
    read(raw, "overall_truth_score", "overallTruthScore", "overall_score", "score"),
    inferredOverall,
  );

  const subScores = DEFAULT_SUB_SCORE_NAMES.map((defaultName, index) => {
    const item = suppliedSubScores[index];
    if (!item) {
      return {
        name: defaultName,
        score: overall,
        confidence: 15,
        note: "This dimension was missing from the model response; shown with low confidence.",
      };
    }
    return {
      name: asText(read(item, "name", "dimension", "label"), defaultName),
      score: asScore(read(item, "score", "value"), overall),
      confidence: asScore(read(item, "confidence", "certainty"), 35),
      note: asText(read(item, "note", "reason", "explanation"), "No explanation supplied."),
    };
  });

  let confidenceLow = asScore(read(raw, "confidence_low", "confidenceLow", "low"), overall - 20);
  let confidenceHigh = asScore(
    read(raw, "confidence_high", "confidenceHigh", "high"),
    overall + 20,
  );
  if (confidenceLow > confidenceHigh) {
    [confidenceLow, confidenceHigh] = [confidenceHigh, confidenceLow];
  }

  const report: AnalysisReport = {
    subject_summary: asText(
      read(raw, "subject_summary", "subjectSummary", "summary"),
      "Limited evidence — treat this result cautiously",
    ),
    overall_truth_score: overall,
    confidence_low: confidenceLow,
    confidence_high: confidenceHigh,
    verdict: normalizeVerdict(read(raw, "verdict", "assessment"), overall),
    sub_scores: subScores,
    red_flags: asStringArray(read(raw, "red_flags", "redFlags", "risks")),
    green_flags: asStringArray(read(raw, "green_flags", "greenFlags", "positive_signals")),
    catfish_risk: asScore(read(raw, "catfish_risk", "catfishRisk"), 100 - overall),
    ai_generated_photo_risk: asScore(
      read(raw, "ai_generated_photo_risk", "aiGeneratedPhotoRisk", "ai_photo_risk"),
      100 - subScores[1].score,
    ),
    recommendation: asText(
      read(raw, "recommendation", "advice", "next_steps"),
      "The model returned an incomplete report. Use the available signals as hints, not proof.",
    ),
  };

  // Keep this final assertion as an internal invariant, after all recovery logic has run.
  return ReportSchema.parse(report);
}

const InputSchema = z.object({
  url: z.string().url().optional(),
  imageDataUrls: z.array(z.string()).max(6).optional(),
  notes: z.string().max(2000).optional(),
});

const SYSTEM_PROMPT = `You are DMatch, a satirical "dating-profile lie detector" AI. The user submits a public dating or social profile (Tinder, Hinge, Bumble, Soul, LinkedIn) for entertainment-only authenticity scoring.

Score five sub-dimensions, each 0-100 (higher = more authentic) with a confidence 0-100:
1. Photo Authenticity — angles, lighting consistency, EXIF-style cues, real vs studio/glamour
2. AI-Generated Detection — telltale signs of GAN/diffusion (hands, ears, hair edges, symmetry)
3. Identity Consistency — age claims vs photos, job/school plausibility, location consistency
4. Wealth & Status Signals — props (cars, watches, travel) too on-the-nose or genuine
5. Social Proof — bio cohesion, prompt depth, evidence of real social context

Return a JSON object with these keys: subject_summary, overall_truth_score, confidence_low, confidence_high, verdict, sub_scores, red_flags, green_flags, catfish_risk, ai_generated_photo_risk, recommendation. sub_scores should contain the five dimensions above. Use numeric 0-100 values where requested. Verdict ladder: LIKELY_REAL (80+), MIXED_SIGNALS (60-79), HIGH_RISK (40-59), LIKELY_FAKE (<40).

Tone: blunt, witty, mildly sarcastic — like a skeptical friend. Always include a closing recommendation. If input is minimal, widen the confidence interval and say so. NEVER claim certainty about a real person; frame as probabilistic entertainment.

EVIDENCE DISCIPLINE (HARD RULE — violation = invalid report):
- Reason ONLY from the supplied SCRAPED CONTENT, attached IMAGES, and USER NOTES.
- NEVER invent names, employers, schools, ages, cities, photo subjects, or biographical facts not present in the inputs.
- For any sub-dimension with no supporting evidence, set confidence ≤ 20, note "No evidence in source", and keep score near 50.
- subject_summary must paraphrase only what the inputs show. If the inputs are thin, say so (e.g. "Limited profile text; minimal photo evidence").`;

export const analyzeProfile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    if (!data.url && !data.imageDataUrls?.length && !data.notes) {
      throw new Error("Provide a URL, an image, or notes");
    }

    // Real fetch first — refuse to hallucinate if the page is unreachable.
    let scraped: { markdown: string; title?: string; sourceUrl: string; screenshotUrl?: string } | null =
      null;
    if (data.url) {
      const { scrapeProfile } = await import("./scrape.server");
      const result = await scrapeProfile(data.url);
      if (!result.ok) {
        throw new Error(`UNREACHABLE:${result.reason}:${result.message}`);
      }
      scraped = {
        markdown: result.markdown.slice(0, 8000),
        title: result.title,
        sourceUrl: result.sourceUrl,
        screenshotUrl: result.screenshotUrl,
      };
    }

    // Guard against an all-empty request (URL refused, no image, no notes).
    const hasEvidence =
      !!scraped || !!data.imageDataUrls?.length || (data.notes?.trim().length ?? 0) >= 20;
    if (!hasEvidence) {
      throw new Error(
        "UNREACHABLE:EMPTY:No usable evidence. Upload a screenshot or paste profile text in Notes.",
      );
    }

    const gateway = createLovableAiGatewayProvider(key);

    const userContent: Array<{ type: "text"; text: string } | { type: "image"; image: string }> =
      [];

    const promptParts: string[] = [];
    if (data.url) promptParts.push(`Profile URL submitted by user: ${data.url}`);
    if (scraped) {
      if (scraped.title) promptParts.push(`Page title: ${scraped.title}`);
      promptParts.push(
        `SCRAPED CONTENT (verbatim; do not invent anything beyond this):\n<<<\n${scraped.markdown}\n>>>`,
      );
    } else if (data.url) {
      promptParts.push("(No scraped content available.)");
    }
    if (data.notes) promptParts.push(`User notes: ${data.notes}`);
    if (data.imageDataUrls?.length)
      promptParts.push(`User attached ${data.imageDataUrls.length} screenshot(s).`);
    promptParts.push("\nReturn the structured DMatch report grounded ONLY in the above.");

    userContent.push({ type: "text", text: promptParts.join("\n\n") });
    if (scraped?.screenshotUrl) {
      userContent.push({ type: "image", image: scraped.screenshotUrl });
    }
    if (data.imageDataUrls?.length) {
      for (const image of data.imageDataUrls) {
        userContent.push({ type: "image", image });
      }
    }

    try {
      const { output } = await generateText({
        model: gateway.chatModel("google/gemini-3-flash-preview"),
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
        output: Output.json({
          name: "dmatch_report",
          description: "A best-effort dating profile authenticity analysis report",
        }),
      });

      return normalizeAnalysisReport(output);
    } catch (err) {
      // JSON mode can still produce fenced or prefixed JSON through compatible gateways.
      // Recover that payload before giving up, then normalize any incomplete fields.
      if (NoObjectGeneratedError.isInstance(err) && err.text) {
        const start = err.text.indexOf("{");
        const end = err.text.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try {
            return normalizeAnalysisReport(JSON.parse(err.text.slice(start, end + 1)));
          } catch (recoveryError) {
            console.error("DMatch JSON recovery failed", recoveryError);
          }
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("429")) {
        throw new Error("RATE_LIMIT: Too many requests. Try again in a minute.");
      }
      if (message.includes("402")) {
        throw new Error("CREDITS: Workspace AI credits exhausted. Add credits to continue.");
      }
      throw new Error(`Analysis failed: ${message}`);
    }
  });
