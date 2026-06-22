# DMatch 项目交付计划

定位：**"约会主页测谎仪"** — 粘贴 Tinder/Soul/LinkedIn 链接或上传截图，AI 输出真/假置信度评分与风险报告。免费版查个人，付费版解锁批量、反向匹配、深度报告。

## 交付物（4 份）

按以下顺序产出，全部存放在 `/mnt/documents/`，可下载：

1. **`01_market_research.md`** — 商业调研报告
2. **`02_business_plan.md`** — 商业计划书（投资人版）
3. **`03_native_dev_spec.md`** — 原生 iOS / Android / 微信小程序开发文档（给外部团队 / Cursor 使用）
4. **Web MVP** — 在 Lovable 上构建，作为可点击 Demo + PWA，浏览器即用，后续可 Capacitor 套壳

---

## Step 1 — 商业调研（并行 4 路 web 搜索）

输出 `01_market_research.md`，覆盖：

- **竞品分析**：Photofeeler、ROAST、YourMove AI、Keepers、Rizz、Wing AI、国内"颜值检测"类小程序 — 功能矩阵、定价、用户量、评价、差异化空隙
- **市场规模 & 定价**
  - 美国 / 日本 / 中国在线约会市场 TAM、SAM
  - dating-assistant 类产品 ARPU、订阅价格带（$9.99 / $19.99 / $29.99 月）
  - LinkedIn profile-review 付费意愿（B2B 副赛道）
- **法律 & 合规风险**
  - Tinder/LinkedIn/Soul ToS 中关于爬虫、二次分发画像的条款
  - GDPR / CCPA / 中国 PIPL 对"人脸 + 个人评价"的限制
  - 名誉权、肖像权诉讼先例
  - 风险缓解方案（用户自上传、本地处理、声明 entertainment-only）
- **病毒营销案例**
  - "金坷垃"、Plankton 攻击力广告、Cards Against Humanity、Liquid Death、DuoLingo 抽象营销
  - 争议性 dating app 营销（Bumble、Thursday、Feeld）
  - 适合 DMatch 的 TikTok / 小红书 / Twitter 钩子脚本 3 条

## Step 2 — 商业计划书 `02_business_plan.md`

章节：执行摘要 / 问题 & 方案 / 产品（含截图占位）/ 商业模式（Freemium，免费 3 次/天，Pro $14.99 月 + Lifetime $79）/ 市场 & GTM（US 切入"反 catfish"，JP 切入"鉴定优质男"）/ 竞争 / 增长飞轮（争议营销 + UGC 测评）/ 技术架构概览 / 团队招募 / 财务预测 3 年 / 融资请求 / 风险与对策。

## Step 3 — 原生三端开发文档 `03_native_dev_spec.md`

**注意：Lovable 本身不生成原生代码**，但可输出高质量规范文档供外部团队/AI IDE 落地：

- **架构选型**：iOS (SwiftUI) + Android (Jetpack Compose) + 微信小程序 (Taro / 原生)，共用一套 REST + WebSocket 后端
- **API 契约**（OpenAPI 风格）：`POST /analyze/url`、`POST /analyze/images`、`GET /report/{id}`、`POST /auth`、`POST /pay/subscribe`
- **核心算法管线**：URL → 爬虫（Playwright Cloud 或第三方 SerpAPI/Apify）→ 图片 + 文本 → 多模态 LLM（Gemini 3 Pro）→ 评分器（真实度 0-100 + 置信区间 + 子维度：照片真伪/职业造假/财富信号/年龄一致性/AI 生成痕迹）→ 报告
- **数据库 schema**（用户、报告、订阅、举报）
- **三端 UI 流程图 + 页面清单**（首页粘贴框 → 加载动画 → 报告页 → 付费墙 → 历史）
- **支付**：Apple IAP / Google Play Billing / 微信支付
- **合规清单**：用户上传声明、删除请求接口、免责弹窗文案
- **每个端的代码骨架示例**（SwiftUI View + Compose Composable + 小程序 page）

## Step 4 — Web MVP（Lovable 上实际构建）

最小可交互闭环：

- 落地页（洗脑风格 hero：大字"TA 是真的吗？"、争议性 slogan、自动播放动效）
- 粘贴 URL 输入框 + 上传截图 dropzone
- "分析中"动画（模仿小人射击数字怪物的攻击力加成视觉）
- 报告页：总分 + 置信区间环形图 + 子维度雷达图 + 风险标记列表
- 付费墙（占位 Stripe，先不接通）
- 历史记录（Lovable Cloud 存储）

**MVP 真实 AI 调用**：用 Lovable AI Gateway 的 `google/gemini-3-flash-preview` 多模态接口，接收图片 URL/上传，输出 JSON 评分。URL 爬虫第一版用 Firecrawl connector。

不在 MVP 内：真实支付、原生推送、反向匹配。

---

## 设计方向（Web MVP）

- **风格**：黑红高对比 + 故障艺术，反"温柔约会 app"的甜美调性
- **主色**：`#0A0A0A` 背景 / `#FF2D55` 危险红 / `#00FF88` 真实绿 / `#FFD60A` 警告黄
- **字体**：标题 Space Grotesk Bold（争议、现代），正文 Inter
- **动画**：评分时数字滚动 + 故障闪烁；进度条用"攻击力 +N"风格

## 技术栈（Web MVP）

- TanStack Start（Lovable 默认）
- Lovable Cloud（用户、报告存储）
- Lovable AI Gateway（Gemini 3 多模态评分）
- Firecrawl connector（URL 抓取）
- Tailwind + shadcn

## 时序

切到 build 模式后我会：① 并行跑 4 个调研 subagent → ② 写 3 份文档到 `/mnt/documents/` 并以 artifact 形式呈现 → ③ 构建 Web MVP → ④ 视觉 QA 一遍报告页。

## 需要你确认

如果方向 OK，回复"开始"即可。如果想调整定位、去掉某份交付物、或换颜色字体，告诉我。
