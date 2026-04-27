# 建筑渲染叙事一致性规则库 (Narrative Rules) v1.0

## 目标
把“有人有事”升级为“有主叙事、有证据链、有情绪闭环”的可验证故事系统。

## 核心原则
- 好渲染图不是堆元素，而是表达一个清晰时刻。
- 每张图只允许一个**主叙事事件**（Primary Beat），其余是辅助证据。
- 叙事必须被画面可见信息支持，不能只写抽象情绪词。

---

## Story Card（生成前必填）
写实模式必须先构建以下叙事卡片：

1. **Where**: 建筑功能与场景（museum/office/campus/hotel...）
2. **When**: 时段与天气（morning/rainy/blue hour...）
3. **Who**: 主体人群（commuters/students/tourists/residents...）
4. **What**: 主叙事事件（唯一）
5. **Why**: 事件动机（通勤/参观/休憩/等待）
6. **Mood**: 目标情绪（serene/energetic/contemplative...）
7. **Evidence**: 至少 2 个可见证据（道具/姿态/空间痕迹）

---

## 冲突分级
- **N0 (Hard Narrative Conflict)**: 叙事自相矛盾，无法成立。
- **N1 (Strong Narrative Weakness)**: 可成立但非常弱或违和。
- **N2 (Soft Narrative Weakness)**: 信息可读性不足，可优化。

---

## A. 主叙事完整性

### A1 单主事件规则 (N0)
**规则**: 一张图只允许一个主叙事事件。  
**冲突例**: 同时“商务通勤高峰”与“婚礼庆典主舞台”。  
**修复**: 保留一个主事件，其他降为背景。

### A2 5W 缺项 (N1)
**规则**: Where/When/Who/What 至少完整 4 项。  
**修复**: 缺失项从用户输入补问或隐式推断并声明。

### A3 证据链不足 (N1)
**规则**: 每个主事件至少 2 个可见证据。  
**修复**: 加入动作、道具、空间痕迹（如伞、行李、排队线）。

---

## B. 建筑功能与行为耦合

### B1 功能-行为冲突 (N0)
**规则**: 行为需符合建筑类型与时间。  
**冲突例**: 医院急诊入口外“野餐派对”。  
**修复**: 行为改为功能相关活动。

### B2 密度节奏失配 (N1)
**规则**: 人群密度与功能/时段匹配。  
**修复**: 清晨文化馆降低密度；晚高峰交通枢纽提高流动性。

---

## C. 情绪闭环

### C1 情绪-光线-行为不一致 (N0)
**规则**: 情绪词需由光线与行为共同支撑。  
**冲突例**: “宁静冥想”同时“喧闹集会+高动感奔跑”。  
**修复**: 对齐为同一情绪方向。

### C2 情绪只写形容词无证据 (N2)
**规则**: 禁止仅写 `serene/vibrant` 而无画面证据。  
**修复**: 增加对应动作和场景细节。

---

## D. 视角与叙事焦点

### D1 焦点缺失 (N1)
**规则**: 主叙事事件需在构图中可定位（入口/前景/中景）。  
**修复**: 明确事件位置和镜头关注区域。

### D2 镜头与叙事不协同 (N2)
**规则**: 大远景不宜承载细碎微表情故事。  
**修复**: 要么拉近焦距，要么改为群体级叙事。

---

## E. 真实性边界

### E1 写实宣称门槛 (N0 Process)
**规则**: 若 N0 未清零，不得宣称 photorealistic storytelling。  
**修复**: 先修复故事冲突或降级为概念叙事。

---

## Narrative Score（0-100）建议
- 初始分 100
- 每个 N0: -35
- 每个 N1: -15
- 每个 N2: -5
- 下限 0

**判定**:
- `>=80` 且 `N0=0`: Pass（叙事可读）
- `60-79`: Revise（叙事补强后输出）
- `<60`: Block（主叙事需重构）

---

## Narrative Gate Report（输出模板）
```text
Narrative Gate Report
- Primary Beat: commuters entering office lobby after rain
- Findings: 0xN0, 1xN1, 1xN2
- Actions: added queue-at-entrance behavior; reduced conflicting leisure actions
- Narrative Score: 80 -> pass
```
