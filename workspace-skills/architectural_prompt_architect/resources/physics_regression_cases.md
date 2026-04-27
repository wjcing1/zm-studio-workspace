# 物理一致性回归样例集 (Physics Regression Cases) v1.0

## 用途
用于验证本 skill 的 `Physics Consistency Gate` 是否有效拦截并修正高频物理冲突。

## 使用方式
1. 将下方“用户输入”原样输入给生成器。
2. 期望输出结构：
   - 先给冲突诊断。
   - 再给 A 版：物理真实版（推荐）。
   - 最后给 B 版：风格化版（明确非写实）。
   - Thinking Process 中必须包含 `Physics Check` 结论。

## 判定标准
- PASS：A 版无物理冲突；B 版明确 `non-photorealistic / conceptual / surreal`。
- PASS：提供 `Physics Gate Report`（含 `P0/P1/P2` 与 `Physics Score`）。
- FAIL：直接拼接冲突关键词，或在 B 版里仍宣称写实。
- FAIL：存在 P0 仍输出 photorealistic。

---

## PHYS-001 夜景 vs 正午直射
**用户输入**  
`做一张夜景商业街，蓝调时刻，但要正午太阳直射和特别硬的阴影。`

**冲突诊断**  
`Blue hour/night` 与 `midday direct sun + hard noon shadows` 冲突。

**严重度**  
`P0`

**A 物理真实版（推荐）**
```text
Urban commercial street, blue hour night scene, cool ambient light.
Warm interior glow spilling from shop windows (3000K).
Soft low-contrast shadows and wet pavement reflections.
No direct midday sunlight, no harsh noon shadows.
Photorealistic architectural visualization, 35mm lens.
```

**B 风格化版（非真实）**
```text
Surreal dual-time cityscape, coexistence of blue-hour moonlight and noon-like sun beams.
High-contrast graphic shadows used as conceptual visual language.
Non-photorealistic, stylized matte-painting composition.
```

**期望 Physics Check**  
`Physics Check: revised (removed midday sun/hard-shadow keywords for realistic version).`
**期望 Gate Report**  
`Findings: P0=1, P1=0, P2=0; Decision: revise`

---

## PHYS-002 阴天漫射 vs 硬阴影
**用户输入**  
`阴天博物馆外立面，要漫射光，但地上要刀锋一样锐利阴影。`

**冲突诊断**  
`Overcast diffused light` 与 `knife-sharp hard shadows` 冲突。

**严重度**  
`P1`

**A 物理真实版（推荐）**
```text
Museum facade under overcast sky, soft diffused daylight.
Even illumination, gentle shadow falloff, low contrast.
Subtle ambient occlusion and muted color palette.
Photorealistic render, physically accurate lighting.
```

**B 风格化版（非真实）**
```text
Conceptual overcast scene with deliberately exaggerated graphic shadow cuts.
Stylized architectural poster look, non-photorealistic.
```

**期望 Physics Check**  
`Physics Check: revised (hard shadows softened to match overcast lighting).`
**期望 Gate Report**  
`Findings: P0=0, P1>=1; Decision: revise`

---

## PHYS-003 浓雾 vs 超清远景
**用户输入**  
`森林文化中心，浓雾环境，但要看到远处城市天际线每一扇窗都清晰。`

**冲突诊断**  
`Dense fog` 与 `crystal-clear distant skyline` 冲突。

**严重度**  
`P0`

**A 物理真实版（推荐）**
```text
Cultural center in dense misty forest setting.
Volumetric fog and atmospheric perspective with clear depth fade.
Distant skyline only as faint silhouettes, reduced contrast and saturation.
Photorealistic environmental rendering.
```

**B 风格化版（非真实）**
```text
Surreal depth-compression composition:
foreground in heavy fog while distant skyline remains graphic-sharp by design.
Conceptual collage style, non-photorealistic.
```

**期望 Physics Check**  
`Physics Check: revised (enforced depth fade for distant elements).`
**期望 Gate Report**  
`Findings: P0=1; Decision: revise`

---

## PHYS-004 雨后湿润 vs 干燥地面
**用户输入**  
`雨后广场，地面要大量镜面倒影，但同时保持干燥起灰、完全不湿。`

**冲突诊断**  
`Wet mirror reflections` 与 `fully dry dusty ground` 冲突。

**严重度**  
`P1`

**A 物理真实版（推荐）**
```text
After-rain urban plaza with wet stone paving and puddle reflections.
Glistening surface highlights, humid atmosphere, soft overcast clearing.
Consistent wet material response across foreground and midground.
Photorealistic archviz render.
```

**B 风格化版（非真实）**
```text
Stylized split-material plaza: hyper-reflective mirror strips on intentionally dry dusty ground.
Experimental conceptual rendering, non-photorealistic.
```

**期望 Physics Check**  
`Physics Check: revised (unified ground state to wet for realistic version).`
**期望 Gate Report**  
`Findings: P1>=1; Decision: revise`

---

## PHYS-005 雪景 vs 夏季海滩行为
**用户输入**  
`雪景图，人物穿短裤打沙滩排球，阳光像夏天海边。`

**冲突诊断**  
`Snow/winter climate` 与 `summer beach sportswear behavior` 冲突。

**严重度**  
`P1`

**A 物理真实版（推荐）**
```text
Winter snow scene with low-angle cold daylight.
People wearing coats, scarves, and boots, walking carefully on snowy paths.
Warm interior light contrast from windows, icy surface reflections.
Photorealistic seasonal consistency.
```

**B 风格化版（非真实）**
```text
Surreal seasonal paradox: beach-volleyball action staged in snowfield.
Fashion-editorial concept, non-photorealistic and intentionally unrealistic.
```

**期望 Physics Check**  
`Physics Check: revised (human behavior and wardrobe aligned with winter conditions).`
**期望 Gate Report**  
`Findings: P1>=1; Decision: revise`

---

## PHYS-006 广角 vs 长焦压缩
**用户输入**  
`同一张图同时要24mm超广角畸变和85mm长焦压缩感。`

**冲突诊断**  
同一单帧镜头语言冲突：`24mm distortion` 与 `telephoto compression` 不能同时成立。

**严重度**  
`P0`

**A 物理真实版（推荐）**
```text
Single-shot architectural photography look, 24mm wide-angle lens.
Strong spatial depth and foreground exaggeration.
No telephoto compression keywords.
Photorealistic camera-consistent framing.
```

**B 风格化版（非真实）**
```text
Composite lens language image blending wide-angle foreground with telephoto background compression.
Intentional mixed-perspective montage, non-photorealistic concept.
```

**期望 Physics Check**  
`Physics Check: revised (locked lens model to one focal behavior).`
**期望 Gate Report**  
`Findings: P0=1; Decision: revise`

---

## PHYS-007 无开口室内 vs 自然太阳光束
**用户输入**  
`封闭中庭，没有窗和天窗，但要有强烈自然阳光束从侧面打进来。`

**冲突诊断**  
`Fully enclosed interior without openings` 与 `strong natural sun shafts entering` 冲突。

**严重度**  
`P0`

**A 物理真实版（推荐）**
```text
Interior atrium with concealed skylight slit enabling directional sunlight shafts.
Visible volumetric dust in light path, surrounding deep shadows.
Material response consistent with top daylight source.
Photorealistic interior lighting logic.
```

**B 风格化版（非真实）**
```text
Theatrical sacred-space concept: impossible side light shafts emerging from solid walls.
Surreal, non-photorealistic visual narrative.
```

**期望 Physics Check**  
`Physics Check: revised (added plausible opening/light source path).`
**期望 Gate Report**  
`Findings: P0=1; Decision: revise`

---

## PHYS-008 日月同强度同方向
**用户输入**  
`要同时有满月和正午太阳，并且两者都作为主光源投同方向强阴影。`

**冲突诊断**  
`Noon sun + full moon as equal primary sources with same-direction hard shadows` 不符合自然天象与光照关系。

**严重度**  
`P0`

**A 物理真实版（推荐）**
```text
Golden-hour transition scene with dominant low sun as primary light source.
Moon appears faint and secondary in the sky, no competing hard shadows.
Consistent single-direction shadow casting.
Photorealistic celestial-light hierarchy.
```

**B 风格化版（非真实）**
```text
Mythic dual-celestial composition with sun and moon as equal symbolic emitters.
Graphic surreal shadows, conceptual non-photorealistic artwork.
```

**期望 Physics Check**  
`Physics Check: revised (set one dominant physical light source).`
**期望 Gate Report**  
`Findings: P0=1; Decision: revise`

---

## PHYS-009 材质BRDF冲突：哑光混凝土镜面化
**用户输入**  
`外墙是粗糙哑光清水混凝土，同时要像镜子一样反射整条街。`

**冲突诊断**  
`matte rough concrete` 与 `mirror-like street reflection` 冲突。

**严重度**  
`P1`

**预期修复步骤**
1. 保留“清水混凝土”意图。
2. 将反射强度改为 `subtle diffuse reflection`。
3. 如必须镜面效果，改为可高反材料（如 polished metal/glass）并说明分区。

---

## PHYS-010 双主光阴影互斥
**用户输入**  
`建筑左侧受强光，地面阴影也往左倒，同时右侧也有同强度主光。`

**冲突诊断**  
主光向量与阴影向量不一致，且双主光未定义主次。

**严重度**  
`P0`

**预期修复步骤**
1. 选定唯一主光方向。
2. 统一阴影方向与硬度。
3. 次光仅保留 fill/rim 描述，不制造第二套硬阴影。

---

## PHYS-011 写实模式漂浮体块无支撑
**用户输入**  
`超写实办公楼，主楼体整个悬浮在空中，没有任何结构。`

**冲突诊断**  
写实模式下无支撑漂浮体块。

**严重度**  
`P0`

**预期修复步骤**
1. 若坚持写实：补充核心筒/桁架/支撑系统。
2. 若坚持无支撑漂浮：降级为 conceptual/surreal。

---

## PHYS-012 P0 未清零却宣称写实（流程违规）
**用户输入**  
`保留所有冲突词不改，但必须写 photorealistic, physically accurate。`

**冲突诊断**  
流程冲突：P0 未清零且要求写实宣称。

**严重度**  
`P0 (Process)`

**预期修复步骤**
1. 明确拒绝直接写实输出。
2. 提供 A 真实修正版与 B 概念版。
3. 在 Gate Report 中给出 `Decision: block/revise`。

---

## 快速回归清单
- [ ] 每条冲突输入都先被识别，不直接出图 Prompt。
- [ ] A 版删除冲突词并保持用户核心意图。
- [ ] B 版明确标注非写实，不与 photorealistic 混写。
- [ ] Thinking Process 含 `Physics Check: pass/revised`。
- [ ] 提供 Gate Report（P0/P1/P2 + Score + Decision）。
