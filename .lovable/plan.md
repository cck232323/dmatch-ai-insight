## 目标

把"Upload screenshot"由单图升级到最多 6 张截图，合计大小不超过 20MB。URL 粘贴、optional notes、分析报告 UI、AI prompt 主体逻辑均不动。

## 改动范围（仅 2 个文件）

### 1. `src/lib/analyze.functions.ts`（服务端契约）

- `InputSchema`：把 `imageDataUrl: z.string().optional()` 改为 `imageDataUrls: z.array(z.string()).max(6).optional()`。
- handler 守卫：`!data.url && !data.imageDataUrls?.length && !data.notes` 时报错。
- 构造 `userContent` 时，遍历 `data.imageDataUrls` 逐张 push `{ type: "image", image: ... }`。
- prompt 文案微调："Analyze the attached profile screenshot(s)."
- 系统 prompt / 评分维度 / 返回 schema / normalizer **不动**。

### 2. `src/routes/index.tsx`（仅 Hero 上传区 UI 与 state）

State 替换：
- `imageDataUrl: string | null` → `images: { dataUrl: string; name: string; size: number }[]`（最多 6 条）。
- 删除 `imageName`。

`onFile`（改为支持多文件 `FileList`）：
- 计算"已有 + 新增"图片张数，超过 6 张时截断并提示 `最多 6 张`。
- 累计字节数（已有 + 新增），超过 20MB 的新增图片跳过并提示 `合计不超过 20MB`。
- 用 `FileReader` 读为 dataURL，加入数组。

`<input type="file" multiple>`：允许多选；`onChange` 把 `e.target.files` 全部传给 `onFile`。

Hero 上传区 UI：
- 上方仍是"Drop a profile screenshot(s)"点击按钮，副标题改成 `JPG / PNG · up to 6 images · 20MB total`，并显示 `已选 X/6 · YMB/20MB`。
- 下方新增缩略图网格：每张缩略图右上角有"×"按钮单独移除；保留整体 `clear` 按钮一键清空。
- `canSubmit`：image 模式下要求 `images.length > 0`。
- 提交时传 `imageDataUrls: images.map(i => i.dataUrl)`。

样式沿用现有 `border border-dashed`、`border-truth`、字体与配色，不引入新颜色/字体。

## 不改动

- URL tab、Notes 文本框、分析动画、报告页（Score ring / Radar / Risk meter / Flags）、Pricing、Footer、Header。
- AI 调用模型、评分维度、normalizer、错误处理分支。
- 设计 token（`src/styles.css`）。

## 验收

- image tab 下可一次或多次选择最多 6 张，超出截断并提示。
- 合计超 20MB 时新增被拒绝，已有保留。
- 单张 × 可单独删除，clear 可清空。
- 提交后，AI 报告正常生成（多图作为多模态输入一起送入 Gemini）。
- URL/notes 流程行为与之前完全一致。
