## 问题

Preview 一直显示 "Preview has not been built yet"，因为 TypeScript build 失败：

```
src/lib/scrape.server.ts(465,40): error TS2769
formats: string[] is not assignable to FormatOption[]
```

`getScrapeOptions()` 返回的对象里 `formats: ["markdown", "screenshot"]` 被推断成 `string[]`，而 Firecrawl SDK 期望严格联合类型 `FormatOption[]`。同样 `actions` 数组里 `type: "wait" | "executeJavascript" | ...` 也会被推断成宽 `string`，传给 SDK 会再次报错。

## 解决方案

只改 `src/lib/scrape.server.ts` 一个文件，给字面量加 `as const` 让 TS 推断成具体字面量类型，不动业务逻辑、不动 UI、不动 prompt、不动小红书登录浮层逻辑。

具体改动：

1. `getScrapeOptions(host)` 的 `baseOptions.formats` 改成 `["markdown", "screenshot"] as const` 的等价写法（或直接对每个 action 对象用 `as const`）。
2. XHS 分支的 `actions` 数组里每个对象（`{ type: "wait", ... }`, `{ type: "executeJavascript", ... }`, `{ type: "scroll", direction: "down" }`, `{ type: "scrape" }`）整体加 `as const`，避免 `type`/`direction` 被拓宽成 `string`。
3. 如果 `as const` 与现有 `mobile` / `location` 等 mutable 字段冲突，就把 `formats` 单独抽成 `const formats = ["markdown", "screenshot"] satisfies FormatOption[]` 风格（用 SDK 暴露的类型），或退一步显式标注 `formats: ("markdown" | "screenshot")[]`。

不改动：

- 抓取流程、登录墙判别、错误映射、Firecrawl actions 内容、UI、Gemini prompt、评分维度、Pricing、Header/Footer、设计 token。

## 验收

- `bunx tsgo --noEmit` 退出码 0，无 TS2769。
- Preview 重新构建并显示首页。
- 粘贴小红书 / LinkedIn / 普通 URL 行为与修复前完全一致。
