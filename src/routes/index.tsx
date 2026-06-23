import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Flame,
  Loader2,
  Link as LinkIcon,
  ShieldAlert,
  Skull,
  Sparkles,
  Upload,
  X,
  Zap,
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

import { analyzeProfile, type AnalysisReport } from "@/lib/analyze.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DMatch — TA 是真的吗？AI 约会主页测谎仪" },
      {
        name: "description",
        content:
          "粘贴 Tinder / Hinge / Bumble / Soul / LinkedIn 主页链接或上传截图，DMatch 用 AI 给出真假置信度评分。Entertainment only.",
      },
      { property: "og:title", content: "DMatch — TA 是真的吗？" },
      {
        property: "og:description",
        content:
          "AI 给约会主页打真假分。美国约会太复杂，日本帅哥太匮乏 — 用就用 DMatch.",
      },
    ],
  }),
  component: Index,
});

type Mode = "url" | "image";

type UploadedImage = { dataUrl: string; name: string; size: number };

const MAX_IMAGES = 6;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function Index() {
  const fn = useServerFn(analyzeProfile);
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: async () =>
      fn({
        data: {
          url: mode === "url" && url ? url : undefined,
          imageDataUrls:
            mode === "image" && images.length ? images.map((i) => i.dataUrl) : undefined,
          notes: notes || undefined,
        },
      }),
    onSuccess: () => {
      requestAnimationFrame(() =>
        reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    },
  });

  const onFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (!incoming.length) return;

    setImages((prev) => {
      const next = [...prev];
      let totalBytes = next.reduce((sum, img) => sum + img.size, 0);
      let truncated = false;
      let oversized = false;

      for (const file of incoming) {
        if (next.length >= MAX_IMAGES) {
          truncated = true;
          break;
        }
        if (totalBytes + file.size > MAX_TOTAL_BYTES) {
          oversized = true;
          continue;
        }
        next.push({ dataUrl: "", name: file.name, size: file.size });
        totalBytes += file.size;

        const idx = next.length - 1;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setImages((curr) => {
            const updated = [...curr];
            // Match by name+size in case order shifted (e.g. user removed one mid-read)
            const target = updated.findIndex(
              (img, i) =>
                i >= 0 && img.name === file.name && img.size === file.size && !img.dataUrl,
            );
            if (target >= 0) updated[target] = { ...updated[target], dataUrl };
            return updated;
          });
        };
        reader.readAsDataURL(file);
        void idx;
      }

      if (truncated) alert(`最多上传 ${MAX_IMAGES} 张截图`);
      else if (oversized) alert("合计大小不超过 20MB，部分图片已跳过");

      return next;
    });
  };

  const totalBytes = images.reduce((sum, img) => sum + img.size, 0);
  const allLoaded = images.every((img) => img.dataUrl);

  const canSubmit =
    !mutation.isPending &&
    ((mode === "url" && url.trim().length > 0) ||
      (mode === "image" && images.length > 0 && allLoaded));

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero
        mode={mode}
        setMode={setMode}
        url={url}
        setUrl={setUrl}
        notes={notes}
        setNotes={setNotes}
        images={images}
        totalBytes={totalBytes}
        onPickFile={() => fileRef.current?.click()}
        onRemoveImage={(idx) =>
          setImages((prev) => prev.filter((_, i) => i !== idx))
        }
        onClearImages={() => setImages([])}
        onSubmit={() => mutation.mutate()}
        canSubmit={canSubmit}
        loading={mutation.isPending}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div ref={reportRef} className="container mx-auto max-w-5xl px-4">
        {mutation.isPending && <AnalyzingAnimation />}
        {mutation.isError && (
          <ErrorBox
            message={(mutation.error as Error).message}
            onSwitchToImages={() => {
              setMode("image");
              setUrl("");
              mutation.reset();
            }}
          />
        )}
        {mutation.data && <ReportView report={mutation.data} />}
      </div>

      <SocialProof />
      <Pricing />
      <Footer />
    </main>
  );
}

/* ---------- Header ---------- */

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="container mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center bg-primary text-primary-foreground">
            <Crosshair className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">
            DMatch<span className="text-primary">.</span>
          </span>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#how" className="hover:text-foreground">
            How it works
          </a>
          <a href="#pricing" className="hover:text-foreground">
            Pricing
          </a>
          <a href="#" className="hover:text-foreground">
            Manifesto
          </a>
        </nav>
        <Button size="sm" variant="default" className="font-display tracking-wide">
          ENTER THE ARENA
        </Button>
      </div>
    </header>
  );
}

/* ---------- Hero ---------- */

type HeroProps = {
  mode: Mode;
  setMode: (m: Mode) => void;
  url: string;
  setUrl: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  images: UploadedImage[];
  totalBytes: number;
  onPickFile: () => void;
  onRemoveImage: (idx: number) => void;
  onClearImages: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  loading: boolean;
};

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function Hero(props: HeroProps) {
  const hasImages = props.images.length > 0;
  return (
    <section className="scanlines relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-10%,rgba(255,45,85,0.18),transparent_60%)]" />
      <div className="container mx-auto max-w-5xl px-4 pb-16 pt-20 text-center md:pt-28">
        <p className="mb-4 inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-xs uppercase tracking-widest text-primary">
          <Flame className="h-3.5 w-3.5" /> AI Profile Lie Detector · Beta
        </p>

        <h1 className="glitch font-display text-5xl font-bold leading-[0.95] tracking-tighter md:text-7xl lg:text-8xl">
          TA 是真的吗？
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance font-display text-xl tracking-tight text-muted-foreground md:text-2xl">
          粘贴主页 · 上传截图 · 一键拆穿。
          <br />
          <span className="text-foreground">
            美国约会太复杂，日本帅哥太匮乏 —
          </span>{" "}
          <span className="text-primary">用就用 DMatch.</span>
        </p>

        {/* Input card */}
        <div className="mx-auto mt-10 max-w-2xl border border-border bg-card p-1 text-left shadow-[0_0_0_1px_rgba(255,45,85,0.08),0_20px_60px_-30px_rgba(255,45,85,0.5)]">
          <div className="flex border-b border-border">
            <ModeTab active={props.mode === "url"} onClick={() => props.setMode("url")}>
              <LinkIcon className="h-4 w-4" /> Paste URL
            </ModeTab>
            <ModeTab active={props.mode === "image"} onClick={() => props.setMode("image")}>
              <Upload className="h-4 w-4" /> Upload screenshots
            </ModeTab>
          </div>

          <div className="space-y-3 p-4">
            {props.mode === "url" ? (
              <Input
                value={props.url}
                onChange={(e) => props.setUrl(e.target.value)}
                placeholder="https://tinder.com/@... or linkedin.com/in/..."
                className="h-12 border-input bg-background font-mono text-base focus-visible:ring-primary"
                autoFocus
              />
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={props.onPickFile}
                  disabled={props.images.length >= MAX_IMAGES}
                  className={cn(
                    "flex w-full items-center justify-between border border-dashed border-border bg-background px-4 py-6 text-left transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60",
                    hasImages && "border-truth",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-display text-sm font-medium">
                        {hasImages
                          ? `已选 ${props.images.length}/${MAX_IMAGES} · ${formatMB(props.totalBytes)}MB / 20MB`
                          : "Drop profile screenshots"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        JPG / PNG · up to {MAX_IMAGES} images · 20MB total
                      </div>
                    </div>
                  </div>
                  {hasImages && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onClearImages();
                      }}
                      className="font-mono text-xs text-muted-foreground underline"
                    >
                      clear all
                    </span>
                  )}
                </button>

                {hasImages && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {props.images.map((img, idx) => (
                      <div
                        key={`${img.name}-${idx}`}
                        className="group relative aspect-square overflow-hidden border border-border bg-background"
                      >
                        {img.dataUrl ? (
                          <img
                            src={img.dataUrl}
                            alt={img.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => props.onRemoveImage(idx)}
                          aria-label={`Remove ${img.name}`}
                          className="absolute right-1 top-1 grid h-5 w-5 place-items-center border border-border bg-background/90 text-foreground opacity-90 transition hover:bg-primary hover:text-primary-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Textarea
              value={props.notes}
              onChange={(e) => props.setNotes(e.target.value)}
              placeholder="Optional: paste their bio, age, job claim, anything sus..."
              rows={2}
              className="border-input bg-background text-sm"
            />

            <Button
              onClick={props.onSubmit}
              disabled={!props.canSubmit}
              className="group h-12 w-full font-display text-base font-bold uppercase tracking-widest"
            >
              {props.loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ANALYZING TARGET…
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-5 w-5 transition group-hover:rotate-12" />
                  RUN LIE DETECTOR
                </>
              )}
            </Button>

            <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Entertainment only. Not a verification service. Be kind.
            </p>
          </div>
        </div>

        {/* Trust bar */}
        <div className="mt-12 grid grid-cols-3 gap-4 text-center font-display md:gap-12">
          <Stat n="4.3M" l="profiles scored" />
          <Stat n="68%" l="flagged as sus" color="primary" />
          <Stat n="0.9s" l="avg time-to-truth" color="truth" />
        </div>
      </div>
    </section>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 px-4 py-3 font-display text-sm font-medium tracking-wide transition",
        active
          ? "bg-card text-foreground border-b-2 border-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Stat({
  n,
  l,
  color = "foreground",
}: {
  n: string;
  l: string;
  color?: "foreground" | "primary" | "truth";
}) {
  const colorClass =
    color === "primary"
      ? "text-primary"
      : color === "truth"
        ? "text-truth"
        : "text-foreground";
  return (
    <div>
      <div className={cn("text-3xl font-bold md:text-5xl", colorClass)}>{n}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground md:text-xs">
        {l}
      </div>
    </div>
  );
}

/* ---------- Analyzing animation (small-man-shoots-monster vibe) ---------- */

function AnalyzingAnimation() {
  const steps = [
    { label: "SCAN.profile_url", color: "text-primary", n: "+12" },
    { label: "DETECT.face_landmarks", color: "text-truth", n: "+34" },
    { label: "DETECT.gan_artifacts", color: "text-warning", n: "+17" },
    { label: "VERIFY.bio_consistency", color: "text-truth", n: "+22" },
    { label: "COMPUTE.truth_score", color: "text-primary", n: "+99" },
  ];
  return (
    <div className="my-12 border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between font-mono text-xs uppercase tracking-widest text-muted-foreground">
        <span className="flex items-center gap-2 text-primary">
          <Activity className="h-3.5 w-3.5 animate-pulse" />
          DMatch.exe running
        </span>
        <span>boss_hp: ████░░░░ 48%</span>
      </div>
      <div className="space-y-2 font-mono text-sm">
        {steps.map((s, i) => (
          <div
            key={s.label}
            className="tick flex items-center justify-between border-l-2 border-border bg-background px-3 py-2"
            style={{ animationDelay: `${i * 240}ms`, animationFillMode: "both" }}
          >
            <span className="flex items-center gap-2">
              <Sparkles className={cn("h-3.5 w-3.5", s.color)} />
              {s.label}
            </span>
            <span className={cn("dmg-pop", s.color)} style={{ animationDelay: `${i * 240 + 200}ms` }}>
              {s.n}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Error ---------- */

function ErrorBox({ message }: { message: string }) {
  const friendly = message.startsWith("RATE_LIMIT")
    ? "Slow down, detective. Try again in a minute."
    : message.startsWith("CREDITS")
      ? "Workspace AI credits exhausted. Top up to keep hunting."
      : message;
  return (
    <div className="my-12 flex items-start gap-3 border border-primary bg-primary/10 p-5 font-mono text-sm">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <div className="font-display text-base font-bold uppercase tracking-wide text-primary">
          Mission failed
        </div>
        <div className="mt-1 text-muted-foreground">{friendly}</div>
      </div>
    </div>
  );
}

/* ---------- Report ---------- */

function ReportView({ report }: { report: AnalysisReport }) {
  const verdictMeta = getVerdictMeta(report.verdict);

  return (
    <div className="my-12 space-y-8">
      {/* Headline score */}
      <div className="border border-border bg-card p-6 md:p-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              DMatch report · {new Date().toISOString().slice(0, 10)}
            </div>
            <h2 className="font-display text-3xl font-bold leading-tight md:text-5xl">
              {report.subject_summary}
            </h2>
            <p
              className={cn(
                "mt-4 inline-flex items-center gap-2 border px-3 py-1 font-display text-sm font-bold uppercase tracking-widest",
                verdictMeta.border,
                verdictMeta.bg,
                verdictMeta.text,
              )}
            >
              <verdictMeta.Icon className="h-4 w-4" /> {verdictMeta.label}
            </p>
          </div>

          <ScoreRing
            score={report.overall_truth_score}
            low={report.confidence_low}
            high={report.confidence_high}
          />
        </div>

        <p className="mt-6 border-t border-border pt-6 font-display text-lg italic text-muted-foreground">
          "{report.recommendation}"
        </p>
      </div>

      {/* Sub-scores radar + risks */}
      <div className="grid gap-6 md:grid-cols-5">
        <div className="border border-border bg-card p-6 md:col-span-3">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Sub-dimension breakdown
          </h3>
          <SubRadar data={report.sub_scores} />
          <div className="mt-4 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            {report.sub_scores.map((s) => (
              <div key={s.name} className="flex items-center justify-between border border-border bg-background px-3 py-2">
                <span className="truncate text-xs">{s.name}</span>
                <span className={cn("font-display font-bold", scoreColor(s.score))}>
                  {s.score}
                  <span className="ml-1 text-[10px] text-muted-foreground">±{Math.round((100 - s.confidence) / 2)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 md:col-span-2">
          <RiskMeter label="Catfish risk" value={report.catfish_risk} icon={Skull} />
          <RiskMeter
            label="AI-generated photos"
            value={report.ai_generated_photo_risk}
            icon={Sparkles}
          />
        </div>
      </div>

      {/* Flags */}
      <div className="grid gap-6 md:grid-cols-2">
        <FlagList
          title="Red flags"
          items={report.red_flags}
          tone="danger"
          icon={AlertTriangle}
        />
        <FlagList
          title="Green flags"
          items={report.green_flags}
          tone="truth"
          icon={CheckCircle2}
        />
      </div>

      {/* CTA strip */}
      <div className="flex flex-col items-center justify-between gap-4 border border-primary bg-primary/5 p-6 md:flex-row">
        <p className="font-display text-lg">
          Want batch scans, reverse-match, and the deep dossier?
        </p>
        <Button size="lg" className="font-display tracking-widest">
          UPGRADE TO PRO
        </Button>
      </div>

      <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        DMatch produces probabilistic, entertainment-only assessments. Not a background check.
      </p>
    </div>
  );
}

function getVerdictMeta(v: AnalysisReport["verdict"]) {
  switch (v) {
    case "LIKELY_REAL":
      return {
        label: "Likely Real",
        Icon: CheckCircle2,
        border: "border-truth",
        bg: "bg-truth/10",
        text: "text-truth",
      };
    case "MIXED_SIGNALS":
      return {
        label: "Mixed Signals",
        Icon: Activity,
        border: "border-warning",
        bg: "bg-warning/10",
        text: "text-warning",
      };
    case "HIGH_RISK":
      return {
        label: "High Risk",
        Icon: AlertTriangle,
        border: "border-primary",
        bg: "bg-primary/10",
        text: "text-primary",
      };
    case "LIKELY_FAKE":
      return {
        label: "Likely Fake",
        Icon: Skull,
        border: "border-primary",
        bg: "bg-primary/20",
        text: "text-primary",
      };
  }
}

function scoreColor(n: number) {
  if (n >= 75) return "text-truth";
  if (n >= 55) return "text-warning";
  return "text-primary";
}

function ScoreRing({
  score,
  low,
  high,
}: {
  score: number;
  low: number;
  high: number;
}) {
  const size = 200;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  const color = scoreColor(score).replace("text-", "");
  const cssColor =
    color === "truth"
      ? "var(--truth)"
      : color === "warning"
        ? "var(--warning)"
        : "var(--danger)";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={cssColor}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-6xl font-bold" style={{ color: cssColor }}>
          {score}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          TRUTH SCORE
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          CI [{low}–{high}]
        </div>
      </div>
    </div>
  );
}

function SubRadar({ data }: { data: AnalysisReport["sub_scores"] }) {
  const chartData = data.map((d) => ({
    subject: d.name.length > 16 ? d.name.slice(0, 15) + "…" : d.name,
    score: d.score,
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={chartData} outerRadius="75%">
          <PolarGrid stroke="var(--color-border)" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="score"
            dataKey="score"
            stroke="var(--danger)"
            fill="var(--danger)"
            fillOpacity={0.35}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RiskMeter({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tone = value > 60 ? "primary" : value > 35 ? "warning" : "truth";
  const toneVar =
    tone === "primary" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--truth)";
  return (
    <div className="border border-border bg-card p-5">
      <div className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-widest text-muted-foreground">
        <span className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" /> {label}
        </span>
        <span className={cn("font-display text-base font-bold", `text-${tone}`)}>{value}%</span>
      </div>
      <div className="h-2 w-full bg-background">
        <div
          className="h-full transition-all"
          style={{ width: `${value}%`, background: toneVar }}
        />
      </div>
    </div>
  );
}

function FlagList({
  title,
  items,
  tone,
  icon: Icon,
}: {
  title: string;
  items: string[];
  tone: "danger" | "truth";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const color = tone === "danger" ? "text-primary" : "text-truth";
  const borderClass = tone === "danger" ? "border-primary/40" : "border-truth/40";
  return (
    <div className={cn("border bg-card p-5", borderClass)}>
      <h3 className={cn("mb-3 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide", color)}>
        <Icon className="h-5 w-5" /> {title}
      </h3>
      {items.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">— none flagged —</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={cn("mt-1 inline-block h-1.5 w-1.5 shrink-0", `bg-${tone === "danger" ? "primary" : "truth"}`)} />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Social proof ---------- */

function SocialProof() {
  const quotes = [
    {
      q: "Caught my Hinge match using a 2017 photo. DMatch saved my Friday.",
      a: "— Maya, Brooklyn",
    },
    {
      q: "I scored 91. I am, in fact, real.",
      a: "— Kenji, 渋谷",
    },
    {
      q: "Ran it on my ex's new LinkedIn. Worth the $14.99 just for the radar chart.",
      a: "— anonymous PM",
    },
  ];
  return (
    <section id="how" className="border-t border-border bg-card/40 py-20">
      <div className="container mx-auto max-w-5xl px-4">
        <h2 className="text-center font-display text-3xl font-bold tracking-tight md:text-5xl">
          Field reports.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {quotes.map((q, i) => (
            <div key={i} className="border border-border bg-background p-6">
              <p className="font-display text-lg leading-snug">"{q.q}"</p>
              <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {q.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Pricing ---------- */

function Pricing() {
  const tiers = [
    {
      name: "Free",
      price: "$0",
      desc: "Find out who's lying.",
      features: ["3 scans / day", "URL + screenshot input", "Basic truth score"],
      cta: "Start scanning",
      highlight: false,
    },
    {
      name: "Pro",
      price: "$14.99",
      sub: "/ month",
      desc: "Hunt at scale.",
      features: [
        "Unlimited scans",
        "Deep dossier (photo EXIF, reverse search)",
        "Batch URL upload",
        "Compare two profiles",
        "Export PDF report",
      ],
      cta: "Go Pro",
      highlight: true,
    },
    {
      name: "Lifetime",
      price: "$79",
      desc: "One-time. Never lied to again.",
      features: ["Everything in Pro", "Forever", "Early access to Reverse-Match"],
      cta: "Buy once",
      highlight: false,
    },
  ];
  return (
    <section id="pricing" className="border-t border-border py-20">
      <div className="container mx-auto max-w-5xl px-4">
        <h2 className="text-center font-display text-3xl font-bold tracking-tight md:text-5xl">
          The truth is cheap.
        </h2>
        <p className="mt-3 text-center text-muted-foreground">
          Lies cost more. Pick a plan.
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={cn(
                "flex flex-col border bg-card p-6",
                t.highlight ? "border-primary shadow-[0_0_0_1px_var(--primary)]" : "border-border",
              )}
            >
              {t.highlight && (
                <span className="mb-3 inline-block w-fit bg-primary px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary-foreground">
                  Most picked
                </span>
              )}
              <div className="font-display text-2xl font-bold">{t.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t.desc}</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold">{t.price}</span>
                {t.sub && (
                  <span className="font-mono text-xs text-muted-foreground">{t.sub}</span>
                )}
              </div>
              <ul className="my-6 flex-1 space-y-2 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-truth" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant={t.highlight ? "default" : "outline"}
                className="font-display tracking-widest"
              >
                {t.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */

function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="container mx-auto flex max-w-6xl flex-col gap-3 px-4 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground md:flex-row md:justify-between">
        <span>
          © {new Date().getFullYear()} DMatch · Truth · Speed · Petty satisfaction.
        </span>
        <span>Entertainment only · Be kind · No catfish were harmed</span>
      </div>
    </footer>
  );
}
