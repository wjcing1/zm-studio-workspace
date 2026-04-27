# 建筑渲染物理一致性规则库 (Physics Rules) v1.0

## 目标
把“看起来合理”升级为“可判定、可修复、可回归”的物理一致性系统。

## 概念
- **P0 (Hard Conflict)**: 物理上不可同时成立。若目标是写实，必须修复后才能输出。
- **P1 (Strong Implausibility)**: 可勉强解释但高度不可信。默认应修复。
- **P2 (Soft Tension)**: 不违背物理但表达松散，可优化。

---

## A. 光源与阴影 (Illumination)

### A1 单主光方向一致性 (P0)
**规则**: 同一画面主光源方向应唯一，所有可见硬阴影方向应一致。  
**冲突例**: 左侧主光 + 阴影朝左。  
**修复**: 统一主光向量并重写阴影描述。

### A2 时段-太阳高度耦合 (P0)
**规则**: `Blue hour/night` 不得出现 `midday overhead sun / noon hard shadows`。  
**修复**: 保留时段，删除冲突日照关键词。

### A3 阴天漫射阴影软化 (P1)
**规则**: `Overcast` 应对应 `soft, low-contrast shadows`。  
**修复**: 将 `harsh/sharp` 改为 `soft/diffused`。

### A4 夜景光源层级 (P1)
**规则**: 夜景应由人工光与环境散射主导，避免白天级直射逻辑。  
**修复**: 加强 `interior glow / street lighting`，压低太阳直射词。

---

## B. 天气与大气 (Atmosphere)

### B1 雾度-能见度衰减 (P0)
**规则**: `Dense fog/volumetric fog` 必须伴随远景对比和清晰度衰减。  
**修复**: 增加 `depth fade / reduced contrast in distance`。

### B2 降雨-地表状态一致 (P1)
**规则**: `After rain / wet` 不应同时描述 `fully dry dusty ground`。  
**修复**: 统一为湿态或干态，不混写。

### B3 雪景温度语义 (P1)
**规则**: 雪景默认低温语义，人物行为/服装应匹配。  
**修复**: 行为替换为低温场景动作。

---

## C. 材质与反射 (Material Optics)

### C1 反射强度与材质类型 (P1)
**规则**: `matte raw concrete` 不应写成 `mirror-like reflection`。  
**修复**: 降低为 `subtle/specular` 或切换材质为可高反类型。

### C2 湿润增亮逻辑 (P1)
**规则**: 湿表面会增强镜面高光并改变粗糙度表现。  
**修复**: 若写 wet，补充 `glistening / puddle / specular highlights`。

### C3 透明与磨砂互斥 (P0)
**规则**: 同一区域同一玻璃不能同时 `highly transparent` 且 `fully frosted opaque`。  
**修复**: 拆分为分区材质或二选一。

---

## D. 室内外光路 (Light Path)

### D1 自然光入射路径 (P0)
**规则**: 室内强自然光束必须有开口路径（窗/天窗/中庭开缝）。  
**修复**: 添加可解释开口或改为人工定向光。

### D2 逆光与受光面描述一致 (P1)
**规则**: 若声明强逆光，主立面不应同时描述为正面强受光。  
**修复**: 调整为轮廓光/边缘高光叙述。

---

## E. 镜头与成像 (Camera / Optics)

### E1 单帧焦段一致 (P0)
**规则**: 单帧不应同时 `24mm wide distortion` 与 `85mm tele compression`。  
**修复**: 锁定一个焦段行为。

### E2 景深与场景尺度协同 (P2)
**规则**: 大场景建筑总图默认不宜极浅景深。  
**修复**: 改为 moderate DoF 或移除 bokeh 强描述。

---

## F. 结构与重力 (Geometry / Gravity)

### F1 承重合理性 (P1)
**规则**: 大悬挑需有结构暗示（核心筒、桁架、支撑）。  
**修复**: 增加结构系统描述。

### F2 漂浮违和 (P0)
**规则**: 写实模式下禁止无理由漂浮体量。  
**修复**: 取消漂浮或标注概念风格。

---

## G. 叙事与行为 (Human Behavior)

### G1 天气行为耦合 (P1)
**规则**: 雨天应体现避雨行为；大风应避免静态轻薄物体不受影响。  
**修复**: 增加伞、快步、衣物姿态等行为线索。

### G2 功能场景节奏 (P2)
**规则**: 医院、图书馆等场景行为密度不宜与商业广场同强度。  
**修复**: 调整人数与动作节奏。

---

## H. 写实开关 (Photorealism Switch)

### H1 写实模式门槛
- 仅当 `P0=0` 且 `Physics Score >= 85` 时，允许使用 `photorealistic / physically accurate` 宣称。

### H2 概念模式门槛
- 如保留任何 P0 冲突，必须降级为 `conceptual / surreal / non-photorealistic`。

---

## Physics Score（0-100）建议
- 初始分 100。
- 每个 P0: -40
- 每个 P1: -15
- 每个 P2: -5
- 下限 0

**判定**:
- `>=85`: Pass（可写实输出）
- `60-84`: Revise（修复后再输出）
- `<60`: Block（必须重构场景逻辑）

---

## 标准输出片段（供 Thinking Process 使用）
```text
Physics Gate Report
- Mode: photorealistic
- Findings: 1xP0, 2xP1
- Actions: removed midday sun; unified wet ground; softened overcast shadows
- Physics Score: 70 -> revise
```
