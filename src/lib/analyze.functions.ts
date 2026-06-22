import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
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

const InputSchema = z.object({
  url: z.string().url().optional(),
  imageDataUrl: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

const SYSTEM_PROMPT = `You are DMatch, a satirical "dating-profile lie detector" AI. The user submits a public dating or social profile (Tinder, Hinge, Bumble, Soul, LinkedIn) for entertainment-only authenticity scoring.

Score five sub-dimensions, each 0-100 (higher = more authentic) with a confidence 0-100:
1. Photo Authenticity — angles, lighting consistency, EXIF-style cues, real vs studio/glamour
2. AI-Generated Detection — telltale signs of GAN/diffusion (hands, ears, hair edges, symmetry)
3. Identity Consistency — age claims vs photos, job/school plausibility, location consistency
4. Wealth & Status Signals — props (cars, watches, travel) too on-the-nose or genuine
5. Social Proof — bio cohesion, prompt depth, evidence of real social context

Return an overall_truth_score (weighted) plus a [confidence_low, confidence_high] interval reflecting uncertainty (wider when input is sparse). Provide concrete red_flags and green_flags as short bullet strings. Verdict ladder: LIKELY_REAL (80+), MIXED_SIGNALS (60-79), HIGH_RISK (40-59), LIKELY_FAKE (<40).

Tone: blunt, witty, mildly sarcastic — like a skeptical friend. Always include a closing recommendation. If input is minimal, widen the confidence interval and say so. NEVER claim certainty about a real person; frame as probabilistic entertainment.`;

export const analyzeProfile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    if (!data.url && !data.imageDataUrl && !data.notes) {
      throw new Error("Provide a URL, an image, or notes");
    }

    const gateway = createLovableAiGatewayProvider(key);

    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image"; image: string }
    > = [];

    const promptParts: string[] = [];
    if (data.url) promptParts.push(`Profile URL: ${data.url}`);
    if (data.notes) promptParts.push(`User notes: ${data.notes}`);
    if (!data.url && !data.notes) promptParts.push("Analyze the attached profile screenshot.");
    promptParts.push("\nReturn the structured DMatch report.");

    userContent.push({ type: "text", text: promptParts.join("\n") });
    if (data.imageDataUrl) {
      userContent.push({ type: "image", image: data.imageDataUrl });
    }

    try {
      const { experimental_output } = await generateText({
        model: gateway.chatModel("google/gemini-3-flash-preview"),
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
        experimental_output: Output.object({ schema: ReportSchema }),
      });

      return experimental_output as AnalysisReport;
    } catch (err) {
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
