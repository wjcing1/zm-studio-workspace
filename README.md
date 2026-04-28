# zm-studio-workspace

> 为建筑学生与建筑师设计的画布式 AI 工作台 —— Canvas 是思考空间，**Think With The Board** 是和你一起看画布的 AI 伙伴，技能库按需展开成专业能力。

![Status](https://img.shields.io/badge/status-alpha-orange)
![Tech](https://img.shields.io/badge/stack-React%2019%20%2F%20Node%20%2F%20TlDraw%20%2F%20Yjs-blue)
![AI](https://img.shields.io/badge/AI-OpenAI--compatible-green)
![License](https://img.shields.io/badge/license-private-lightgrey)

![Workspace 主界面 — 左 Skills / 中 Canvas / 右 Think With The Board](docs/assets/hero.png)

---

## 目录

- [Why — 这个项目要解决什么](#why--这个项目要解决什么)
- [三个工作面](#三个工作面)
- [核心特性](#核心特性)
- [产品设计决策](#产品设计决策)
- [内置 Skills](#内置-skills)
- [技术架构](#技术架构)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [当前状态与路线图](#当前状态与路线图)
- [致谢](#致谢)

---

## Why — 这个项目要解决什么

**目标人群**：建筑学生与建筑师。

> 当前处于目标用户假设阶段，N=5 用户访谈进行中，定位会随访谈反馈迭代。

**痛点**：建筑设计的日常流程横跨多个阶段 —— 灵感收集、参考整理、方案推敲、渲染产出、汇报输出 —— 但这些阶段散落在浏览器、Pinterest、Figma、PPT、AI 聊天窗口等十几个工具里。**缺一个能把"画布上的思考"、"AI 的推理"和"资料的管理"串成同一个上下文的工作面**。

**解法**：把三件事放进同一个三栏界面：
- 中间是 **Canvas**（节点+边的语义图，不是纯自由白板）
- 右侧是 **Think With The Board**（能读到画布上下文、能写回画布的 AI 伙伴）
- 左侧是 **Skills**（按需调用的专业能力，5 个内置技能）

AI 不是独立的聊天窗口，**它能"看懂"节点之间的连线，能用 Apply With AI 直接在画布上增删节点和连线**，生成的图也直接落到画布上。

---

## 三个工作面

| 页面 | 定位 | 关键能力 |
|---|---|---|
| **Workspace**（画布） | 单个项目内的"思考与拼贴"工作台 | 节点画布 + Think With The Board + Skills + 实时协作 |
| **Projects**（项目分类账） | 跨项目的"我有哪些项目"总览 | 项目列表（ID / 客户 / 状态 / 预算 / 团队）+ Project AI Manager 侧栏 |
| **Assets**（资产库） | 跨项目的"我有哪些素材"瀑布流 | 渲染图 / 概念稿 / 提案封面分类 + 全文搜索 + AI Asset Librarian 侧栏 |

每个页面都内嵌一个角色定制的 AI 助手，共享同一套 Agent Loop 后端。

---

## 核心特性

### Canvas — 节点 + 边的语义图

- **6 种节点类型**：`text`（Markdown 文本卡）、`image`（图片）、`file`（PDF / 文件）、`link`（外链或内部引用）、`group`（分组容器）、`project`（项目快捷方式，点击进入对应画布）
- **边（edges）**：拖拽节点边界创建连线，支持四边锚点（left/right/top/bottom）、箭头方向、颜色、文字标签 —— **AI 把边当作语义关系来读**
- **画布操作**：自由拖拽 / 缩放 / 平移 / 框选（marquee）/ 复制粘贴（自定义 MIME `x-zm-workspace+json`）/ 撤销重做（不限深度）/ 导入导出（JSON Canvas 格式 `.canvas` / `.json`）

### Think With The Board — 双向 AI 画布伙伴

- **看得到画布**：选中的节点会以**完整内容**喂给模型（含图片 URL、Markdown 正文、tag、文件元数据），未选中节点以**紧凑形式**（仅 id / type / position / label）传入；连线关系一并打包
- **`Space` 键聚焦**：选中节点 + Space → 自动锁定为 AI 上下文，面板显示 `AI Context: [节点标签]`
- **Apply With AI 写回画布**：Agent 不是"回复一段话"，而是返回**结构化操作清单**（addNode / updateNode / removeNode / addEdge / removeEdge / generateImage），后端解析后直接应用到画布
- **流式工具调用 UI**：每次工具调用前后推送 SSE 事件，画面上实时显示 `⏳ tool_name...` → `✓`，不只看到最终回复
- **多轮对话 + 持久化**：对话按 board 持久化，刷新页面恢复；`+` 按钮新对话，时钟按钮翻历史
- **`@skill_id` mention**：在输入框 `@architectural_prompt_architect` 直接召唤指定技能；UI 提供一键插入按钮

### 持久记忆（自动）

Agent 自动从用户消息里识别**"记住" / "默认" / "本项目" / "总是"** 这类关键词的语句，分类为 `preference` / `constraint` / `decision` / `fact`，按 `board` / `project` scope 存储，下次召回时按**关键词匹配 + 新近度 + 置信度**评分，取 top-5 注入上下文。

### 实时协作

- 基于 Yjs 13.6 CRDT + Y-WebSocket，支持离线编辑后自动合并
- HUD 显示连接状态：`Realtime idle` / `Realtime connecting` / `Realtime live (N)`
- 协作光标 + 用户名标签 + 选区高亮，独立 DOM 层渲染不干扰画布交互
- 两种持久化模式：`local-file`（本地 JSON）/ `websocket`（协作服务器）

### AI 图像生成

- 在对话里直接说"生成一张……"，Agent 返回 `generateImage` 操作 → 后端走 `OPENAI_IMAGE_MODEL`（默认 `gpt-image-2`）→ 图像存到 `.data/uploads/{boardKey}/` → 自动作为 image 节点落到画布

---

## 产品设计决策

这一节记录关键设计选择背后的"为什么"。

### 三栏布局：Skills 左、Canvas 中、Think With The Board 右

试过两栏（Canvas + Chat）和顶部 tab 切换，都不够好。**两栏的问题**是 Skills 没有视觉锚点，用户记不住有哪些专业能力可以调；**顶部 tab 的问题**是切换割裂了"边想边查"的工作节奏。三栏让用户在不离开画布上下文的前提下，随时看到可用技能 + 随时和 AI 对话，决策成本最低。

右栏命名为 **"Think With The Board"** 而不是 "AI Chat"，是为了把这个 AI 的角色用名字钉住 —— 它不是聊天对象，是"和你一起看画布的人"。

### Agent 返回结构化操作，不是直接调写入工具

Agent 的工具集只有 4 个（`load_skill` / `bash` / `read_file` / `write_file`），**没有 `addNode` / `updateNode` 这样的画布写入工具**。Agent 通过 JSON 返回 `operations[]`，后端解析后执行。这样做的收益：
- Agent 上下文更精简（不需要为画布操作维护几十个工具 schema）
- 操作清单可审计、可批量预演、可未来加 undo 链
- 后端是唯一的"画布事实源"，前端、AI、协作各方拿到的都是一致结果

### Skills 用 SKILL.md 做 progressive disclosure

每个 skill 是独立目录，含一份 `SKILL.md` 元数据。**Agent 默认只看到 `<available_skills>` 列表（id + 一句描述，预算 ≤15000 字符）**；当判断需要某个 skill 时调 `load_skill` 把对应 SKILL.md 拉进上下文，再用 bash / read_file / write_file 执行该技能的脚本。
- system prompt 不会随 skill 数量线性膨胀
- 新增 skill 只是新建一个目录
- Session 结束清理临时目录，资源自动回收

### Agent Loop 上限设 12 轮

正常多步任务（搜索 → 整理 → 生成）通常 4-6 轮收敛，12 轮是给复杂任务留的安全边际。超过这个数大概率是模型陷在循环里，宁可让用户介入。

### AI Gateway 抽象层

通过 `OPENAI_BASE_URL` + `OPENAI_MODEL` + `OPENAI_IMAGE_MODEL` 兼容任何 OpenAI 协议的网关，不绑定具体厂商。切换模型 / 网关只改环境变量。

---

## 内置 Skills

按需加载的 5 个专业能力。每个都有 SKILL.md 描述触发场景与调用方式。

### 1. `architectural_prompt_architect` ⭐ — 建筑渲染 Prompt 工程

> 项目最有特色的 skill。把建筑师粗略的描述（"山顶度假酒店"）转成 D5 / Lumion / Stable Diffusion 可用的商业级渲染 Prompt。

- **8 段参数卡**：主体 / 光线氛围 / 建筑特征 / 材质 / 环境 / 配景 / 输出控制 / 负面词
- **物理一致性检查**：光源-阴影、天气-能见度、材质反射、室内外光路、透视关系一一校验，输出 P0/P1/P2 评分；冲突时给出"物理真实版"和"风格化版"两套
- **叙事完整性检查**：根据光线时段补全配景人物行为（黄昏 → "下班职员拿咖啡"），输出 N0/N1/N2 评分
- **材质 ID 绑定**：从 `material_catalog.v1.json` 映射标准材质令牌
- 资源：14 个核心知识库文件（framework / corpus / workflow / categories / physics_rules / narrative_rules）

### 2. `pptx` — PPT 全生命周期

- **创建**：HTML → PPTX 自动排版（基于 html2pptx + Playwright 渲染验证）
- **编辑**：解包现有 .pptx → 改 XML → 重打包
- **分析**：提取文本 / 注释 / 母版信息
- 内置 8 段设计原则与颜色板库
- 依赖：markitdown / pptxgenjs / playwright / sharp / LibreOffice / Poppler

### 3. `web_search` — 联网检索

- 基于 Tavily API，返回结构化结果（answer 摘要 + results[] 含 title / url / content / 相关性评分）
- 触发：用户说"搜一下" / 询问最新事件、价格、规范
- 依赖：`TAVILY_API_KEY`（也兼容 `SERPAPI_API_KEY`）

### 4. `visual_search` — 图像反向搜索

- 基于 SerpAPI Google Reverse Image，找视觉相似图片 + 溯源 + 同风格素材
- 返回：相似图片列表 + 知识图谱（识别地标 / 人物时）
- 依赖：`SERPAPI_API_KEY`（免费额度 100/月）

### 5. `link_ingest` — 网页内容摄入

- 基于开源 Jina Reader，把任意 URL 转成干净 Markdown
- 自动去导航 / 广告，保留正文 / 链接 / 图片
- 无需 API key

---

## 技术架构

| 层 | 技术 |
|---|---|
| 前端 | React 19.2 / Vite 8 / TypeScript 6 / TlDraw 4.5（hybrid + compat 双渲染）|
| 服务器 | Node.js 原生 HTTP，SSE 流式响应 |
| AI | OpenAI SDK 6.33（兼容任意 OpenAI 协议网关） |
| Agent Loop | 自实现，最多 12 轮工具调用，4 个工具：`load_skill` / `bash` / `read_file` / `write_file` |
| 协作 | Yjs 13.6 + Y-WebSocket 3.0 + ws 8.20 |
| 存储 | Better-SQLite3（结构化数据）+ 文件系统（白板 `.data/boards/` + 上传 `.data/uploads/`）+ 持久记忆（`.data/memory/`） |
| 构建 | Vite 工作区构建 + 自定义 build-pages 脚本 |
| PWA | Service Worker + manifest.webmanifest |

**核心目录**：

```
├── server.mjs                          # 主服务器入口（HTTP + Agent Loop 编排，1671 行）
├── workspace-assistant-tools.mjs       # Agent 4 个工具的定义（load_skill / bash / read_file / write_file）
├── workspace-assistant-skills.mjs      # Skill 加载器（progressive disclosure）
├── workspace-memory.mjs                # 自动持久记忆抽取
├── memory-store.mjs                    # 记忆存储（按 scope + 相关性评分召回）
├── realtime-collaboration-server.mjs   # Yjs WebSocket 协作服务
├── sqlite-studio-repository.mjs        # SQLite 数据访问层
├── workspace-skills/                   # 5 个内置技能（每个含 SKILL.md）
├── src/workspace/                      # React 工作台前端（TS）
├── scripts/
│   ├── workspace-page.js               # 画布主逻辑（4315 行）
│   ├── projects-page.js                # 项目分类账页面
│   ├── assets-page.js                  # 资产库页面
│   └── shared/assistant-shell.js       # 三栏 shell + Think With The Board 面板
└── workspace-skills/architectural_prompt_architect/   # 项目最有特色的 skill
```

更多内部约定见 [AGENT.md](AGENT.md)。

---

## 快速开始

```bash
# 1. clone
git clone <this-repo>
cd zm-studio-workspace

# 2. 装依赖（Node 20+ 推荐）
npm install

# 3. 配置环境变量
cp .env.example .env
# 至少填入 OPENAI_API_KEY；想用 web_search / visual_search 再填对应密钥

# 4. 启动
npm run dev
# 默认 http://localhost:4173
```

**可用命令**：

| 命令 | 用途 |
|---|---|
| `npm run dev` / `npm start` | 启动开发服务器 |
| `npm run build` | 构建静态页面 |
| `npm run build:workspace` | 单独构建 React 工作台前端 |
| `npm test` | 跑测试套件 |

**键盘快捷键**：

| 键 | 行为 |
|---|---|
| `Space` | 把选中节点锁定为 AI 上下文 |
| `Cmd/Ctrl + Z` / `Shift + Z` | 撤销 / 重做 |
| `Cmd/Ctrl + C` / `V` | 复制 / 粘贴节点（带连线，自定义 MIME） |
| `Delete` / `Backspace` | 删除选中节点或连线 |
| `Enter`（在 AI 输入框） | 发送消息 |

---

## 环境变量

```bash
# AI 网关
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.5
OPENAI_BASE_URL=https://your-gateway/v1   # 任意 OpenAI 协议网关
OPENAI_IMAGE_MODEL=gpt-image-2            # 图像生成走的模型

# 服务端口
PORT=4173

# 协作模式
COLLAB_MODE=server               # server | local
COLLAB_PROVIDER=local-file       # local-file | websocket
COLLAB_REALTIME=false
COLLAB_PRESENCE=false
COLLAB_LOCAL_CACHE=true
BOARD_STORE_DIR=.data/boards     # 白板持久化目录

# Skills 可选密钥
TAVILY_API_KEY=your_tavily_key_here
SERPAPI_API_KEY=your_serpapi_key_here
```

> `OPENAI_BASE_URL` 兼容任何 OpenAI 协议的网关；项目本地默认指向了一个测试网关，生产请替换为自己的服务地址。

---

## 当前状态与路线图

**当前阶段**：Alpha。功能可用，单机 / 小团队场景跑得通，但尚未做账号系统与多租户。

**进行中**：
- N=5 目标用户访谈（建筑学生 / 建筑师）—— 验证三栏工作流和 architectural_prompt_architect 的真实需求强度
- 协作模式的多用户实时压测

**已知限制**：
- 默认协作模式为本地文件，多人实时仍在打磨
- 没有用户体系，目前是单机使用
- AI Gateway 无重试 / 限流策略
- Bash 沙盒：30 秒默认超时（最大 120 秒），stdout/stderr 各 100KB；不适合长任务

**后续考虑**：
- 把访谈反馈固化成产品决策（取消 / 强化 / 新增功能）
- 建筑方案模板库（常用画布拓扑）
- 移动端只读视图（出差现场看方案用）
- Agent 操作的可预演 / 可撤销链

---

## 致谢

构建在以下优秀开源项目之上：
[TlDraw](https://tldraw.dev) · [Yjs](https://yjs.dev) · [OpenAI Node SDK](https://github.com/openai/openai-node) · [Vite](https://vitejs.dev) · [React](https://react.dev) · [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) · [Tavily](https://tavily.com) · [Jina Reader](https://jina.ai/reader) · [SerpAPI](https://serpapi.com)

---

*本仓库目前为私有项目，作为产品迭代与 PM 思维训练的一部分。如果你是建筑学生 / 建筑师，欢迎联系作者参与用户访谈。*
