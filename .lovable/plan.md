## 问题诊断

目前 `analyzeProfile` 只把 URL 字符串塞进 prompt，从未真正抓取页面。Gemini 没有联网能力，于是凭"linkedin.com/in/xxx"这种 slug 直接编造身份、公司、照片描述——经典幻觉。LinkedIn / Tinder / Soul 这类站点对未登录爬虫返回登录墙、429 或空 HTML，模型完全无从判断。

## 解决方案

引入服务端真实抓取，抓不到就**拒绝出报告**，引导用户改用截图或粘贴 bio 文本。

### 1. 接入 Firecrawl connector

通过 `standard_connectors--connect`(`firecrawl`) 注入 `FIRECRAWL_API_KEY`。安装 `@mendable/firecrawl-js`。

### 2. 新增服务端文件 `src/lib/scrape.server.ts`

`scrapeProfile(url)` 返回严格判别联合：

```ts
type ScrapeResult =
  | { ok: true; markdown: string; title?: string; screenshot?: string; sourceUrl: string }
  | { ok: false; reason: "LOGIN_WALL" | "NOT_FOUND" | "BLOCKED" | "EMPTY" | "TIMEOUT" | "ERROR"; message: string };
```

逻辑：
- 调 `firecrawl.scrape(url, { formats: ['markdown','screenshot'], onlyMainContent: true, waitFor: 1500, timeout: 20000 })`。
- 失败/抛错 → 按 status 映射：`402 CREDITS`、`429 RATE_LIMIT`、超时 → `TIMEOUT`、其他 → `ERROR`。
- 成功后用启发式判别（hostname + 内容）：
  - LinkedIn：URL 含 `linkedin.com/in/` 且 markdown 命中 `Sign in|Join now|Join LinkedIn|authwall` 或长度 < 400 → `LOGIN_WALL`
  - Tinder Web (`tinder.com/@`)：命中 `Create account|Log in` 或缺少 bio token → `LOGIN_WALL`
  - Soul (`soulapp` 域)：基本必登录 → `LOGIN_WALL`
  - HTTP 404 / "Page not found" → `NOT_FOUND`
  - markdown 去空白后 < 200 字 → `EMPTY`
- 截图返回 base64（用于多模态喂给 Gemini 时也有视觉证据）。

### 3. 改 `src/lib/analyze.functions.ts`

handler 流程：

1. 若 `data.url`：先 `await scrapeProfile(data.url)`。
   - `ok: false`：直接 `throw new Error(\`UNREACHABLE:${reason}:${message}\`)`，**不调 LLM**。
2. 把抓到的 markdown（截断 8K 字符）拼进 user prompt：`SCRAPED CONTENT (verbatim, do not invent beyond this):\n<<<\n...\n>>>`。
3. 若有 screenshot，作为 `{ type: "image", image: dataUrl }` 一并喂入。
4. 把用户自传的 `imageDataUrls` 继续追加。
5. 系统 prompt 末尾加一条硬约束：**"Only reason about information present in the supplied SCRAPED CONTENT or attached images. If a field is unknown, set its confidence ≤ 20 and say 'No evidence in source'. NEVER fabricate names, employers, schools, ages, or photo descriptions."**
6. 若三种输入（scraped markdown / 用户图 / notes）合计有效信息字节 < 阈值（例如 300 chars 且无图）→ 也走 `UNREACHABLE:EMPTY`。

### 4. 改 `src/routes/index.tsx`

`ErrorBox` 增加对 `UNREACHABLE:*` 的友好映射：

- `LOGIN_WALL`：「这个主页需要登录才能查看。请改用 **Upload screenshots** 上传 1-6 张截图，或把 bio 粘到 Notes。」
- `NOT_FOUND`：「链接打不开（404）。检查 URL 或改上传截图。」
- `BLOCKED` / `TIMEOUT` / `ERROR` / `EMPTY`：对应中文文案 + 一键切到 image tab 的按钮（`setMode('image')`）。
- 复用现有 `RATE_LIMIT` / `CREDITS` 分支。

ErrorBox 内新增 "Switch to screenshots" 按钮，调用回调把 mode 切到 `image` 并清空 url。Hero 本身 UI 不动。

### 5. 进度文案

`AnalyzingAnimation` 的 step 列表里把第一行 `SCAN.profile_url` 文案换成 `FETCH.live_page`（仅文案，节奏不变）。

## 不改动

- 评分维度、normalizer、报告页（Score ring / Radar / Risk meter / Flags）、Pricing、Footer、Header、设计 token、字体、配色。
- 截图上传 6 张 / 20MB 的逻辑。
- Notes 文本框行为。

## 验收

- 粘贴真实可公开的 LinkedIn 公司页 / 个人公开页 → 报告基于真实 markdown，子维度 note 引用到页面里出现的词。
- 粘贴需要登录的 LinkedIn 个人主页 → 不出报告，弹出 `LOGIN_WALL` 提示并提供切到截图模式的按钮。
- 粘贴乱构 URL (`linkedin.com/in/nonexistent-xyz-123`) → `NOT_FOUND` 或 `LOGIN_WALL`，不再编造。
- 粘贴 Tinder / Soul 链接 → 一律 `LOGIN_WALL`，引导上传截图。
- 上传截图模式（无 URL）流程与之前完全一致。

## 需要的工具调用（build 模式下）

1. `standard_connectors--connect` → firecrawl
2. `bun add @mendable/firecrawl-js`
3. 新建 `src/lib/scrape.server.ts`
4. 编辑 `src/lib/analyze.functions.ts`、`src/routes/index.tsx`
