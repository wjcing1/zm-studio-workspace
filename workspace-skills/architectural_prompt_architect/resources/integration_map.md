# 🟢 Prompt Corpus Integration Map (基于框架 V1)

此文档展示如何使用 **《光线材质深度研究V3.0》 (Corpus)** 来精确填充 **《建筑渲染Prompt框架_v1》 (Skeleton)**。

---

## 🏗️ 核心逻辑

**精确控制 = 骨架 (Template V1) + 血肉 (Corpus Data) + 叙事一致性校验 (Narrative Gate) + 物理一致性校验 (Physics Gate)**

| Template 插槽 | 数据来源 (Corpus Source) | 示例填充 (Example) |
| :--- | :--- | :--- |
| `[时段]` | `1.1 自然光时间轴体系` | `Golden Hour` |
| `[光线方向]` | `1.2 光影戏剧学` | `Side lighting` |
| `[材质名称]` | `2.1 核心材质光学特性` | `Board-formed concrete` |
| `[情绪描述]` | `5.1 情绪-光线对照表` | `Serene, contemplative` |

> **Narrative Gate (Mandatory):** 在最终输出前，按 `narrative_rules.md` 构建 Story Card（Where/When/Who/What/Why/Mood/Evidence）并检查 N0/N1/N2。
>
> **Physics Gate (Mandatory):** 在最终输出前，按 `physics_rules.md` 检查 `时间/天气/光照/阴影/材质状态/光路/叙事行为/镜头/结构` 是否一致；冲突项必须先改写后输出。
>
> **Output Requirement:** 在 Thinking Process 中同时附：
> - `Narrative Gate Report`（N0/N1/N2 + Narrative Score + Decision）
> - `Physics Gate Report`（P0/P1/P2 + Physics Score + Decision）
>
> **Regression Entry:** `narrative_regression_cases.md` + `physics_regression_cases.md`

---

## 📝 完整映射的一体化模板

### 【0. 前提控制】 (Prefix)

*(保持不变，来自 V1 模板)*
> `Strictly follow the perspective...`

### 【1. 主体定义】 (Subject)

* **视角/机位**: 由 `【0. 前提控制】` 锁定，不在 Subject 重复声明
* **[建筑类型]**: 用户输入 (e.g., Art Museum)
* **[风格/事务所]**: 见 `prompt_categories.csv` -> `Building Style` (e.g., Zaha Hadid, MIR Style)

### 【2. 光线与氛围】 (Lighting) —— *Corpus 深度集成*

> 画面时间为 `[时段]`，天气呈现 `[天气类型]`，光线从 `[光线方向]` 照射，整体色温 `[色温描述]`，画面氛围 `[情绪描述]`。
> 受光面呈现 `[受光面颜色描述]`，阴影处呈现 `[阴影颜色描述]`，形成 `[对比效果]`。

**🔍 语料库调用指南:**

* **[时段] & [色温]**: 查阅 `研究V3.0` -> `1.1 自然光时间轴体系`
  * *Pick*: `Blue Hour (8000K+)` 或 `Golden Sunrise (2500K)`
* **[天气类型]**: 查阅 `研究V3.0` -> `3.3 特殊天气` 或 `1.1 漫射光系统`
  * *Pick*: `Overcast sky + soft diffused light`
* **[光线方向] & [对比效果]**: 查阅 `研究V3.0` -> `1.2 光影戏剧学`
  * *Pick*: `Side lighting`, `High contrast (Chiaroscuro)`
* **[颜色描述]**: 查阅 `研究V3.0` -> `3.1 室外日景` 中的 `Color Balance`
  * *Pick*: `Warm golden glow` (Light), `Deep teal shadow` (Shadow)

### 【3. 建筑特征】 (Features)

*(主要来自用户输入或图片分析，可参考 Categories 中的描述词)*

### 【4. 材质细节】 (Materials) —— *Corpus 深度集成*

> 建筑外墙采用 `[主材质名称]`，材料 `[状态描述]`，呈现 `[颜色]`，有 `[纹理特征]`...
> 表面呈现出 `[光泽/质感]`。

**🔍 语料库调用指南:**

* **[主材质] & [纹理]**: 查阅 `研究V3.0` -> `2.1 核心材质光学特性`
  * *Pick*: `Fair-faced concrete` + `Board-formed texture`
* **[光泽/质感]**: 查阅 `研究V3.0` -> `2.2 地面材质反射系统` & `光学特性`
  * *Pick*: `Matte finish`, `Soft specularity`, `Strong reflection`

### 【5. 环境与构图】 (Environment)

* **[背景大气]**: 查阅 `研究V3.0` -> `3.3 特殊天气` (e.g., `Atmospheric haze`, `Volumetric fog`)

### 【7. 输出控制】 (Output)

* **[渲染风格]**: 查阅 `研究V3.0` -> `5.2 渲染风格`
  * *Pick*: `Unreal Engine 5`, `V-Ray Corona`, `MIR Style`

---
