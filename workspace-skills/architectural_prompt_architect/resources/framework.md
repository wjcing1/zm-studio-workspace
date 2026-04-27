# 建筑渲染 Prompt 框架 v1.5

> **Architecture Rendering Prompt Framework**
>
> 本框架为建筑AI渲染提示词的通用模板，适用于任何场景。按照填空模板依次填写，即可生成专业级prompt。首先ai需要严格遵循框架生成提示词并交给人类审批，然后调用图像生成工具。

---

# 🎯 总合成模板 | Master Template

> **使用方法**：按照下方各章节的填空模板填写，然后将结果按此顺序组合

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 【完整Prompt = 按此顺序组合各部分】                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ 【0. 前提控制】                                                              │
│ 根据这张图片生成一张建筑渲染图，不要更换视角，严格遵守原图的构图。              │
│ 超级写实，高级的建筑渲染图，高分辨率，高度详细，清晰对焦，                      │
│ 8k resolution，masterpiece，intricate details，photorealistic，              │
│ detailed texture。Strictly follow the perspective of the reference sketch,  │
│ Keep exact geometry, Do not change the camera angle.                        │
│ Ensure physically plausible lighting/material behavior and consistent        │
│ shadow-reflection logic.                                                    │
│                                                                              │
│ 【1. 主体定义】                                                              │
│ [建筑类型]，呈现[场景类型]，整体形态为[建筑形态]，                             │
│ 参考[风格/事务所]的设计风格，采用[焦距]拍摄。                                 │
│                                                                              │
│ 【2. 光线与氛围】                                                            │
│ 画面时间为[时段]，天气呈现[天气类型]，光线从[光线方向]照射，                   │
│ 整体色温[色温描述]，画面氛围[情绪描述]。                                      │
│ 受光面呈现[受光面颜色描述]，阴影处呈现[阴影颜色描述]，形成[对比效果]。          │
│                                                                              │
│ 【3. 建筑特征】                                                              │
│ 建筑体量[体量描述]，线条[线条特征]，形体呈现[形体语言]。                       │
│ 立面采用[立面系统]，具有[立面特征]，整体设计[设计理念]。                       │
│                                                                              │
│ 【4. 材质细节】                                                              │
│ 建筑外墙采用[主材质名称]，材料[状态描述]，呈现[颜色]，                         │
│ 有[纹理特征]，[分缝方式]，有细腻的[变化描述]，表面呈现出[光泽/质感]。          │
│ 次要材质为[次材质名称]，位于[位置]，呈现[次材质效果]。                         │
│ 地面铺装为[地面材质]，[地面状态]。                                            │
│                                                                              │
│ 【5. 环境与构图】                                                            │
│ 前景有[前景元素]，呈现[前景状态/效果]，[虚化程度]。                            │
│ 中景有[中景元素]作为视觉框架，[中景描述]，[光影效果]。                         │
│ 背景是[背景元素]，呈现[背景大气效果]，[远近层次]。                             │
│                                                                              │
│ 【6. 配景与叙事】                                                            │
│ 画面中[人物密度描述]，[人物位置]，正在[活动类型]。                             │
│ [微场景描述：具体的生活场景细节]。                                            │
│                                                                              │
│ 【7. 输出控制】                                                              │
│ 画面比例[比例]，采用[渲染风格]，[额外技术要求]。                               │
│                                                                              │
│ 【8. 负面提示词】                                                            │
│ 负面提示词：[要排除的元素列表]                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# 📋 分部填空模板 | Section Templates

---

## 🧩 八段参数卡输出模板 | Structured 8-Segment Card

> 用于对外展示（便于精确把控每一段），默认仅输出 JSON 参数卡。
> 最终回复时应使用 fenced `json` 代码块包裹，便于一键复制。

```json
{
  "主体定义": {
    "建筑类型": "...",
    "场景类型": "...",
    "建筑形态": "...",
    "风格参考": "...",
    "焦距": "..."
  },
  "光线与氛围": {
    "时段": "...",
    "天气类型": "...",
    "光线方向": "...",
    "色温": "...",
    "情绪": "..."
  },
  "建筑特征": {
    "体量": "...",
    "线条特征": "...",
    "形体语言": "...",
    "立面系统": "...",
    "设计理念": "..."
  },
  "材质细节": {
    "主材": "...",
    "次材": "...",
    "地面材质": "...",
    "材质状态": "...",
    "颜色": "..."
  },
  "环境与构图": {
    "前景元素": "...",
    "中景元素": "...",
    "背景元素": "...",
    "构图策略": "...",
    "镜头机位": "..."
  },
  "配景与叙事": {
    "人物密度": "...",
    "人物位置": "...",
    "活动类型": "...",
    "微场景": "..."
  },
  "输出控制": {
    "画幅比例": "...",
    "渲染风格": "...",
    "画质等级": "...",
    "技术要求": "...",
    "构图锁定": "严格保持原图构图，不改变视角/机位/透视"
  },
  "负面提示词": [
    "...",
    "...",
    "..."
  ]
}
```

---

## 0️⃣ 前提控制 | Prefix Control

### 模板（固定，直接使用）

```
根据这张图片生成一张建筑渲染图，不要更换视角，严格遵守原图的构图。
超级写实，高级的建筑渲染图，高分辨率，高度详细，清晰对焦，
8k resolution，masterpiece，intricate details，photorealistic，detailed texture。
Strictly follow the perspective of the reference sketch, Keep exact geometry, 
Do not change the camera angle.
Ensure physically plausible lighting/material behavior and consistent shadow-reflection logic.
```

### 质量关键词可选池

| 类别   | 可选词汇                                            |
| ------ | --------------------------------------------------- |
| 分辨率 | 8k resolution / ultra HD / 4k / high resolution     |
| 真实感 | photorealistic / hyper-realistic / photo-accurate   |
| 细节   | intricate details / highly detailed / fine textures |
| 对焦   | sharp focus / crisp / crystal clear                 |
| 品质   | masterpiece / premium / professional grade          |

---

## 1️⃣ 主体定义 | Core Subject

### 填空模板

```
[建筑类型]，呈现[场景类型]，
整体形态为[建筑形态]，参考[风格/事务所]的设计风格，采用[焦距]拍摄。
```

### 视角类型 [视角类型]（可选，仅无参考图模式）

> 当前技能默认使用参考图流程，视角已在 `0️⃣ 前提控制` 中锁定，不在 `1️⃣ 主体定义` 重复声明。

| 选项       | 中文       | 英文                                            | 适用场景       |
| ---------- | ---------- | ----------------------------------------------- | -------------- |
| 鸟瞰       | 鸟瞰视角   | Aerial view, drone perspective, bird's eye view | 总图、城市设计 |
| 高角度人视 | 高角度人视 | Elevated view, balcony perspective              | 露台、平台     |
| 人视       | 人视角度   | Eye level perspective, street view, 1.6m height | 入口、广场     |
| 仰视       | 仰视角度   | Worm's eye view, dramatic low angle             | 高层、纪念性   |
| 室内       | 室内透视   | Interior perspective, indoor view               | 中庭、大厅     |

### 建筑类型 [建筑类型]

| 选项 | 中文                   | 英文                                       |
| ---- | ---------------------- | ------------------------------------------ |
| 办公 | 现代主义办公建筑       | Modern office building, commercial complex |
| 文化 | 艺术中心/博物馆/美术馆 | Art center, museum, gallery                |
| 住宅 | 住宅建筑/公寓楼        | Residential building, apartment complex    |
| 教育 | 校园建筑/学校          | Campus building, educational facility      |
| 酒店 | 酒店/度假村            | Hotel, resort                              |
| 商业 | 商业综合体/购物中心    | Commercial complex, shopping mall          |
| 体育 | 体育馆/运动中心        | Stadium, sports center                     |

### 场景类型 [场景类型]

| 选项 | 中文      | 英文                            |
| ---- | --------- | ------------------------------- |
| 城市 | 城市景观  | Urban context, city landscape   |
| 滨水 | 滨水空间  | Waterfront, lakeside, riverside |
| 山地 | 山地环境  | Mountain setting, hillside      |
| 海滨 | 海边/沙滩 | Seaside, coastal, beach         |
| 森林 | 森林环境  | Forest setting, woodland        |
| 草原 | 开阔草地  | Open lawn, meadow               |

### 建筑形态 [建筑形态]

| 选项 | 中文                       | 英文                             |
| ---- | -------------------------- | -------------------------------- |
| 巨构 | 巨大的建筑体量，纪念性尺度 | Massive volume, monumental scale |
| 流线 | 流动的曲线形状，有机形态   | Flowing curves, organic forms    |
| 堆叠 | 层层堆叠，悬挑体量         | Stacked volumes, cantilevered    |
| 水平 | 水平延展，线性布局         | Horizontal extension, linear     |
| 垂直 | 垂直塔楼，高耸挺拔         | Vertical tower, high-rise        |
| 散落 | 分散布局，村落式           | Fragmented, pavilion cluster     |
| 极简 | 极简几何，纯净体块         | Minimalist geometry, pure volume |

### 风格参考 [风格/事务所]

| 选项       | 中文                 | 英文                               |
| ---------- | -------------------- | ---------------------------------- |
| MIR        | MIR效果图公司风格    | MIR rendering style                |
| SANAA      | SANAA风格            | SANAA style, ethereal, transparent |
| 扎哈       | 扎哈·哈迪德风格     | Zaha Hadid style, parametric       |
| 奇普菲尔德 | 大卫·奇普菲尔德风格 | David Chipperfield style           |
| 安藤       | 安藤忠雄风格         | Tadao Ando style                   |
| Bruther    | Bruther事务所风格    | Bruther style, French high-tech    |
| 粗野主义   | 粗野主义风格         | Brutalist style                    |

### 焦距 [焦距]

| 选项 | 效果           | 英文                 |
| ---- | -------------- | -------------------- |
| 24mm | 广角，空间感大 | 24mm wide angle lens |
| 35mm | 标准，自然     | 35mm lens            |
| 50mm | 人眼透视       | 50mm lens            |
| 85mm | 长焦，压缩空间 | 85mm telephoto lens  |

---

## 2️⃣ 光线与氛围 | Lighting & Atmosphere

### 填空模板

```
画面时间为[时段]，天气呈现[天气类型]，光线从[光线方向]照射，
整体色温[色温描述]，画面氛围[情绪描述]。
受光面呈现[受光面颜色描述]，阴影处呈现[阴影颜色描述]，形成[对比效果]。
```

### 时段 [时段]

| 选项       | 中文描述         | 英文                                | 色温       |
| ---------- | ---------------- | ----------------------------------- | ---------- |
| 日出前蓝调 | 日出前的蓝调时刻 | Pre-sunrise blue hour, twilight     | 7000K+     |
| 清晨       | 柔和的清晨光线   | Soft morning light, early daylight  | 4000-4500K |
| 上午       | 明亮的上午阳光   | Bright morning sun                  | 5000K      |
| 正午       | 正午强烈日光     | Bright midday sun, harsh daylight   | 5500-6000K |
| 下午       | 温暖的午后斜射光 | Warm afternoon light, side lighting | 4500-5000K |
| 黄金时刻   | 黄金时刻日落     | Golden hour, sunset glow            | 2500-3000K |
| 蓝调时刻   | 黄昏蓝调时刻     | Blue hour, twilight                 | 8000K+     |
| 夜晚       | 夜景             | Night scene, after dark             | -          |

### 天气类型 [天气类型]

| 选项   | 中文描述                 | 英文                                  |
| ------ | ------------------------ | ------------------------------------- |
| 晴朗   | 晴朗的蓝天，有蓬松的白云 | Clear blue sky, fluffy cumulus clouds |
| 阴天   | 阴天漫射光，无强阴影     | Overcast sky, soft diffused light     |
| 薄雾   | 薄雾弥漫，有大气透视效果 | Misty atmosphere, atmospheric haze    |
| 浓雾   | 浓雾笼罩，体积雾效果     | Volumetric fog, dense mist            |
| 雨后   | 雨后湿润，地面有积水反射 | Wet surfaces, puddle reflections      |
| 戏剧云 | 戏剧性的云层，暗调天空   | Dramatic clouds, moody sky            |
| 雪景   | 雪景，白色地面，内透光   | Snow scene, winter frost              |

### 光线方向 [光线方向]

| 选项   | 中文                | 英文                                    |
| ------ | ------------------- | --------------------------------------- |
| 正面   | 画面正中间洒过来    | Front lighting, from viewer's direction |
| 侧面   | 从画面左侧/右侧照射 | Side lighting, from left/right          |
| 逆光   | 从建筑背后照射      | Backlighting, rim light                 |
| 顶光   | 从正上方照射        | Top lighting, overhead sun              |
| 环境光 | 漫射均匀光线        | Ambient light, diffused                 |

### 色温描述 [色温描述]

| 选项 | 中文           | 英文                      |
| ---- | -------------- | ------------------------- |
| 冷调 | 偏冷的蓝灰色调 | Cool blue-grey tones      |
| 中性 | 中性色温       | Neutral color temperature |
| 偏暖 | 中性偏暖色调   | Neutral warm tones        |
| 暖调 | 温暖的金色调   | Warm golden tones         |
| 极暖 | 强烈的橙红暖调 | Intense warm orange-red   |

### 情绪描述 [情绪描述]

| 选项 | 中文     | 英文                       |
| ---- | -------- | -------------------------- |
| 宁静 | 宁静祥和 | Serene, tranquil, peaceful |
| 清新 | 清新明快 | Fresh, bright, crisp       |
| 戏剧 | 戏剧张力 | Dramatic, cinematic        |
| 神秘 | 神秘朦胧 | Mysterious, ethereal       |
| 活力 | 充满活力 | Vibrant, lively            |
| 沉稳 | 沉稳内敛 | Calm, contemplative        |

### 受光面颜色描述 [受光面颜色描述]

| 光线条件 | 描述模板                                                 |
| -------- | -------------------------------------------------------- |
| 黄金时刻 | 暖白色材质被夕阳染成香槟金色高光，奶油色受光面，杏色辉光 |
| 清晨     | 柔和的淡金色光泽，温润的米白色                           |
| 正午     | 明亮的纯白高光，锐利的受光面                             |
| 阴天     | 均匀的冷白色，无强高光                                   |
| 蓝调     | 微弱的冷蓝色调                                           |

### 阴影颜色描述 [阴影颜色描述]

| 光线条件 | 描述模板                                 |
| -------- | ---------------------------------------- |
| 黄金时刻 | 阴影呈现冷蓝色调，青灰色环境光，深蓝绿色 |
| 清晨     | 淡淡的蓝灰色阴影                         |
| 正午     | 深灰到冷灰阴影，边缘清晰但不纯黑         |
| 阴天     | 柔和的浅灰色阴影                         |
| 蓝调     | 深蓝色的环境阴影                         |

### 对比效果 [对比效果]

| 选项     | 中文               | 英文                            |
| -------- | ------------------ | ------------------------------- |
| 冷暖对比 | 强烈的冷暖对比     | Strong cold-warm contrast       |
| 高对比   | 高对比度的明暗关系 | High contrast, chiaroscuro      |
| 柔和过渡 | 由暖入冷的柔和过渡 | Soft gradient from warm to cool |
| 低对比   | 低对比度，平光效果 | Low contrast, flat lighting     |

---

## 3️⃣ 建筑特征 | Architectural Features

### 填空模板

```
建筑体量[体量描述]，线条[线条特征]，形体呈现[形体语言]。
立面采用[立面系统]，具有[立面特征]，整体设计[设计理念]。
```

### 体量描述 [体量描述]

| 选项   | 中文       | 英文                           |
| ------ | ---------- | ------------------------------ |
| 巨大   | 非常巨大   | Massive, enormous, grand       |
| 纪念性 | 纪念碑式的 | Monumental, imposing           |
| 轻盈   | 轻盈漂浮   | Light, floating, weightless    |
| 厚重   | 厚重敦实   | Heavy, solid, grounded         |
| 适中   | 尺度适中   | Moderate scale, human-friendly |

### 线条特征 [线条特征]

| 选项     | 中文           | 英文                                |
| -------- | -------------- | ----------------------------------- |
| 硬朗直线 | 硬朗、直线条   | Hard-edged, rectilinear, orthogonal |
| 流畅曲线 | 流畅柔和的曲线 | Smooth curves, flowing lines        |
| 微曲线   | 非常轻微的曲线 | Subtle curves, gentle arc           |
| 折线     | 折线形、锯齿形 | Angular, zigzag, faceted            |
| 混合     | 直线与曲线结合 | Mix of straight and curved          |

### 形体语言 [形体语言]

| 选项     | 中文描述           | 英文                                      |
| -------- | ------------------ | ----------------------------------------- |
| 层层叠退 | 层层退台，逐级递进 | Terraced setbacks, cascading volumes      |
| 悬挑漂浮 | 悬挑体量，漂浮失重 | Cantilevered mass, floating volumes       |
| 架空通透 | 底层架空，视线通透 | Pilotis, elevated ground floor            |
| 退台绿化 | 退台种满绿植       | Green terraces, planted balconies         |
| 屋顶起伏 | 屋顶起伏如波浪     | Undulating roof, wave-like canopy         |
| 体块穿插 | 多个体块相互穿插   | Interlocking volumes, intersecting masses |
| 纯净方盒 | 纯净的几何方盒子   | Pure geometric box, clean volume          |

### 立面系统 [立面系统]

| 选项       | 中文描述           | 英文                                         |
| ---------- | ------------------ | -------------------------------------------- |
| 玻璃幕墙   | 通高玻璃幕墙       | Glass curtain wall, floor-to-ceiling glazing |
| 垂直格栅   | 垂直金属格栅       | Vertical louvers, brise-soleil               |
| 水平遮阳   | 水平遮阳板         | Horizontal sunshades, projecting slabs       |
| 石材挂板   | 石材干挂幕墙       | Stone cladding, rainscreen facade            |
| 金属板材   | 金属板立面         | Metal panel facade, aluminum cladding        |
| 双层表皮   | 双层表皮系统       | Double-skin facade, climate buffer           |
| 穿孔表皮   | 穿孔金属表皮       | Perforated screen, mesh facade               |
| 混凝土框架 | 清水混凝土框架外露 | Exposed concrete frame                       |

### 立面特征 [立面特征]

| 选项     | 中文描述             | 英文                                   |
| -------- | -------------------- | -------------------------------------- |
| 韵律感   | 重复的韵律感         | Rhythmic repetition, modular grid      |
| 渐变     | 渐变的开口密度       | Gradient density, varying apertures    |
| 随机     | 随机的窗口分布       | Random fenestration pattern            |
| 对称     | 严格对称的立面       | Strict symmetry, balanced composition  |
| 横向强调 | 强调水平线条         | Horizontal emphasis, linear expression |
| 竖向强调 | 强调垂直线条         | Vertical emphasis, soaring lines       |
| 大虚大实 | 大面积玻璃与实墙对比 | Large glazing vs solid wall contrast   |

### 设计理念 [设计理念]

| 选项       | 中文                 | 英文                               |
| ---------- | -------------------- | ---------------------------------- |
| 简洁纯粹   | 简洁纯粹，无多余装饰 | Clean, pure, no ornamentation      |
| 强调体量   | 强调形式和体量感     | Emphasis on form and mass          |
| 与环境对话 | 与环境的对话融合     | Dialogue with context              |
| 轻盈透明   | 追求轻盈透明         | Seeking lightness and transparency |
| 内外渗透   | 内外空间相互渗透     | Interior-exterior permeability     |

---

## 4️⃣ 材质细节 | Material Details

### 填空模板

```
建筑外墙采用[主材质名称]，材料[状态描述]，呈现[颜色]，
有[纹理特征]，[分缝方式]，有细腻的[变化描述]，表面呈现出[光泽/质感]。
次要材质为[次材质名称]，位于[位置]，呈现[次材质效果]。
地面铺装为[地面材质]，[地面状态]。
```

### 主材质名称 [主材质名称]

#### 混凝土

| 选项       | 中文                 | 英文                               |
| ---------- | -------------------- | ---------------------------------- |
| 白色混凝土 | 精致的白色清水混凝土 | White fair-faced concrete          |
| 清水混凝土 | 木模板肌理清水混凝土 | Board-formed concrete, raw texture |
| 抛光混凝土 | 抛光水磨石混凝土     | Polished concrete, terrazzo        |
| 深灰混凝土 | 深灰色混凝土         | Dark grey concrete, charcoal       |

#### 玻璃

| 选项      | 中文                 | 英文                                   |
| --------- | -------------------- | -------------------------------------- |
| 高透玻璃  | 高透光玻璃幕墙       | High-transparency glass, clear glazing |
| Low-E玻璃 | Low-E镜面反射玻璃    | Low-E glass, reflective, mirror-like   |
| 磨砂玻璃  | 半透明磨砂玻璃       | Frosted glass, diffused translucency   |
| 彩釉玻璃  | 带水平条纹的彩釉玻璃 | Ceramic frit glass, striped pattern    |

#### 金属

| 选项     | 中文                 | 英文                               |
| -------- | -------------------- | ---------------------------------- |
| 白色铝板 | 白色粉喷铝板         | White powder-coated aluminum       |
| 银色铝板 | 银色阳极氧化铝板     | Anodized aluminum, silver          |
| 不锈钢   | 无缝反光银色不锈钢板 | Polished stainless steel, seamless |
| 拉丝铝   | 拉丝铝合金板         | Brushed aluminum, satin finish     |
| 锈钢板   | 耐候锈蚀钢板         | Corten steel, weathered patina     |
| 铜板     | 氧化铜绿锈板         | Copper with verdigris patina       |

#### 石材

| 选项       | 中文               | 英文                        |
| ---------- | ------------------ | --------------------------- |
| 白色石灰岩 | 白色石灰岩挂板     | White limestone cladding    |
| 板岩挂板   | 精致的板岩挂板长砖 | Slate cladding, long format |
| 花岗岩     | 灰色花岗岩         | Grey granite                |
| 大理石     | 白色大理石         | White marble                |

#### 木材

| 选项     | 中文         | 英文                          |
| -------- | ------------ | ----------------------------- |
| 浅色橡木 | 浅色橡木板   | Light oak wood, natural grain |
| 深色胡桃 | 深色胡桃木   | Rich walnut, warm brown       |
| 碳化木   | 日式碳化松木 | Shou sugi ban, charred cedar  |

### 状态描述 [状态描述]

| 选项     | 中文                   | 英文                        |
| -------- | ---------------------- | --------------------------- |
| 干净整洁 | 干净平整，没有任何污渍 | Clean, pristine, no stains  |
| 湿润     | 表面湿润，雨后效果     | Wet surface, rain-slicked   |
| 微微风化 | 有轻微岁月痕迹         | Slightly weathered          |
| 斑驳沧桑 | 斑驳的岁月痕迹         | Patina, wabi-sabi aesthetic |
| 全新     | 崭新的状态             | Brand new condition         |

### 颜色 [颜色]

| 选项 | 中文          | 英文                |
| ---- | ------------- | ------------------- |
| 纯白 | 纯白色        | Pure white          |
| 暖白 | 暖白色/奶油白 | Warm white, cream   |
| 浅灰 | 浅灰色        | Light grey          |
| 深灰 | 深灰色/炭灰色 | Dark grey, charcoal |
| 浅色 | 浅色          | Light-colored       |
| 暖棕 | 暖棕色        | Warm brown          |
| 银色 | 银白色        | Silver              |
| 铜色 | 古铜色        | Bronze, copper      |

### 纹理特征 [纹理特征]

| 选项     | 中文             | 英文                                 |
| -------- | ---------------- | ------------------------------------ |
| 细腻平滑 | 细腻光滑的表面   | Smooth, fine surface                 |
| 木纹肌理 | 自然的木纹肌理   | Natural wood grain                   |
| 石材纹理 | 天然石材纹理     | Natural stone texture                |
| 模板印记 | 木模板印记纹理   | Board-form marks, wood grain imprint |
| 水平凹槽 | 水平线性凹槽     | Horizontal linear grooves            |
| 随机深浅 | 随机轻微深浅变化 | Random subtle tonal variation        |

### 分缝方式 [分缝方式]

| 选项     | 中文         | 英文                              |
| -------- | ------------ | --------------------------------- |
| 横向分缝 | 板材横向分缝 | Horizontal joints                 |
| 竖向分缝 | 板材竖向分缝 | Vertical joints                   |
| 网格分缝 | 规则网格分缝 | Grid pattern joints               |
| 错缝拼接 | 错缝砌筑     | Staggered joints, running bond    |
| 无缝拼接 | 几乎无缝拼接 | Seamless, nearly invisible joints |

### 变化描述 [变化描述]

| 选项     | 中文                 | 英文                                    |
| -------- | -------------------- | --------------------------------------- |
| 宽窄变化 | 细腻的宽窄变化       | Subtle width variation                  |
| 深浅变化 | 细腻的色彩深浅变化   | Subtle tonal gradation                  |
| 反光变化 | 因角度不同的反光变化 | Varying reflections at different angles |
| 无变化   | 均匀一致             | Uniform, consistent                     |

### 光泽/质感 [光泽/质感]

| 选项   | 中文       | 英文                    |
| ------ | ---------- | ----------------------- |
| 哑光   | 哑光质感   | Matte finish            |
| 缎面   | 缎面光泽   | Satin finish            |
| 高光泽 | 高光泽镜面 | High gloss, mirror-like |
| 湿润感 | 湿润的质感 | Wet look, glistening    |
| 粗糙   | 粗糙质感   | Rough texture           |

### 次材质相关

```
次要材质为[次材质名称]，位于[位置]，呈现[次材质效果]。
```

| 位置选项 | 中文          | 英文                  |
| -------- | ------------- | --------------------- |
| 底部     | 建筑底部/基座 | Building base, podium |
| 顶部     | 建筑顶部      | Top of building       |
| 入口     | 入口门廊      | Entrance canopy       |
| 阳台     | 阳台栏杆      | Balcony railings      |
| 屋顶     | 屋顶板        | Roof panels           |

### 地面铺装

```
地面铺装为[地面材质]，[地面状态]。
```

| 地面材质   | 中文               | 英文                          |
| ---------- | ------------------ | ----------------------------- |
| 深灰石材   | 深灰色大块石材铺装 | Dark grey stone pavers        |
| 浅色石材   | 浅色石材铺装       | Light stone paving            |
| 瑞士石丁   | 高级的瑞士石丁铺装 | Premium Swiss cobblestone     |
| 木制平台   | 木制地面铺装       | Wood decking, timber platform |
| 柏油路面   | 柏油马路           | Asphalt road                  |
| 混凝土地面 | 混凝土地面         | Concrete paving               |

| 地面状态 | 中文                 | 英文                                 |
| -------- | -------------------- | ------------------------------------ |
| 干净     | 干净整洁             | Clean, well-maintained               |
| 湿润     | 有少量积水，倒影明显 | Wet with puddles, strong reflections |
| 落叶     | 有落叶散落           | Covered with fallen leaves           |
| 雪覆盖   | 被雪覆盖             | Covered with snow                    |

---

## 5️⃣ 环境与构图 | Environment & Composition

### 填空模板

```
前景有[前景元素]，呈现[前景状态/效果]，[虚化程度]。
中景有[中景元素]作为视觉框架，[中景描述]，[光影效果]。
背景是[背景元素]，呈现[背景大气效果]，[远近层次]。
```

### 前景元素 [前景元素]

| 选项     | 中文            | 英文                                    |
| -------- | --------------- | --------------------------------------- |
| 绿化带   | 前景绿化带      | Foreground green belt, landscape buffer |
| 树枝     | 前景树枝遮挡    | Foreground tree branches framing        |
| 花丛     | 盛开的花丛      | Blooming flowers, flower beds           |
| 芦苇     | 高大的芦苇      | Tall reeds, water plants                |
| 灌木     | 茂密的灌木      | Dense bushes, shrubs                    |
| 巨石     | 巨大的景观石    | Large landscape boulders                |
| 水面     | 静水池塘/反射池 | Still water pond, reflecting pool       |
| 铺装     | 湿润的铺装地面  | Wet pavement                            |
| 自行车道 | 自行车道和标志  | Bike lane with markings                 |
| 咖啡外摆 | 咖啡店外摆桌椅  | Outdoor cafe tables                     |

### 前景状态/效果 [前景状态/效果]

| 选项     | 中文               | 英文                                     |
| -------- | ------------------ | ---------------------------------------- |
| 明媚翠绿 | 植物茂密绿色明媚   | Lush green, vibrant vegetation           |
| 透光嫩绿 | 阳光透过呈现嫩绿色 | Translucent fresh green, backlit foliage |
| 湿润反光 | 湿润闪烁反光       | Wet and glistening                       |
| 野生自然 | 野生自然化的状态   | Wild, naturalistic                       |
| 修剪整齐 | 修剪整齐           | Well-manicured, trimmed                  |

### 虚化程度 [虚化程度]

| 选项     | 中文               | 英文                                  |
| -------- | ------------------ | ------------------------------------- |
| 完全清晰 | 前景完全清晰       | Sharp foreground                      |
| 轻微虚化 | 轻微虚化           | Slightly blurred                      |
| 明显虚化 | 明显景深虚化       | Obvious bokeh, shallow depth of field |
| 强虚化   | 强烈虚化，只剩轮廓 | Strong blur, silhouette only          |

### 中景元素 [中景元素]

| 选项   | 中文               | 英文                          |
| ------ | ------------------ | ----------------------------- |
| 大树   | 几棵大树           | Several large trees           |
| 樱花树 | 盛开的樱花树       | Blooming cherry blossom trees |
| 草坪   | 修剪整齐的绿色草坪 | Manicured green lawn          |
| 水景   | 弯曲的水系         | Curved water feature          |
| 栈道   | 平整的石材栈道     | Stone boardwalk, pathway      |
| 广场   | 城市广场           | Urban plaza                   |

### 中景描述 [中景描述]

| 选项     | 中文                       | 英文                                     |
| -------- | -------------------------- | ---------------------------------------- |
| 视觉框架 | 作为视觉框架，遮挡部分天空 | As visual framing, obscuring part of sky |
| 枝叶繁茂 | 树木枝叶繁茂               | Trees with lush foliage                  |
| 露出建筑 | 建筑中间的架空层露出来树木 | Trees visible through building pilotis   |
| 水面倒影 | 水面平静如镜，倒映建筑     | Mirror-like water reflecting building    |
| 人群活动 | 有人在其中活动             | People engaged in activities             |

### 光影效果 [光影效果]

| 选项     | 中文                                 | 英文                                               |
| -------- | ------------------------------------ | -------------------------------------------------- |
| 树影斑驳 | 阳光穿过树影透出嫩绿色，有大量的树影 | Sunlight filtering through leaves, dappled shadows |
| 长影子   | 投下长长的影子                       | Casting long shadows                               |
| 无阴影   | 阴天无明显阴影                       | No harsh shadows, diffused                         |
| 水面反射 | 水面反射光斑                         | Light reflections on water                         |

### 背景元素 [背景元素]

| 选项       | 中文             | 英文                     |
| ---------- | ---------------- | ------------------------ |
| 蓝天       | 蓝天白云         | Blue sky, white clouds   |
| 天际线     | 城市天际线       | City skyline             |
| 远山       | 远处的山丘       | Distant mountains, hills |
| 森林       | 茂密的森林       | Dense forest             |
| 极简地平线 | 极简的地平线     | Minimal horizon line     |
| 多云天空   | 戏剧性的多云天空 | Dramatic cloudscape      |

### 背景大气效果 [背景大气效果]

| 选项     | 中文               | 英文                           |
| -------- | ------------------ | ------------------------------ |
| 大气透视 | 因雾气变得朦胧模糊 | Atmospheric perspective, hazed |
| 清晰可见 | 清晰可见           | Clear and visible              |
| 薄雾笼罩 | 薄雾笼罩           | Veiled in thin mist            |
| 剪影效果 | 呈现剪影效果       | Silhouette effect              |

### 远近层次 [远近层次]

| 选项     | 中文         | 英文                         |
| -------- | ------------ | ---------------------------- |
| 层次丰富 | 远近层次分明 | Rich layering of distance    |
| 越远越淡 | 越远越淡蓝   | Fading to blue with distance |
| 平面化   | 相对平面化   | Relatively flat              |

---

## 6️⃣ 配景与叙事 | Entourage & Narrative

### 填空模板

```
画面中[人物密度描述]，[人物位置]，正在[活动类型]。
[微场景描述：具体的生活场景细节]。
```

### 人物密度描述 [人物密度描述]

| 选项     | 中文                 | 英文                        |
| -------- | -------------------- | --------------------------- |
| 无人     | 没有人物，空灵宁静   | No people, serene and empty |
| 极少     | 只有几位微小的人物   | Few tiny figures for scale  |
| 稀疏     | 稀疏的人物散布       | Sparse scattering of people |
| 适中     | 有适量的人在活动     | Moderate number of people   |
| 热闹     | 有很多人             | Many people, crowded        |
| 非常热闹 | 非常多的人，热闘忙碌 | Very crowded, bustling      |

### 人物位置 [人物位置]

| 选项   | 中文                   | 英文                                  |
| ------ | ---------------------- | ------------------------------------- |
| 栈道上 | 在栈道上行走或驻足     | On the boardwalk, walking or standing |
| 草坪上 | 在草坪上               | On the lawn                           |
| 广场上 | 在广场上               | In the plaza                          |
| 入口处 | 在建筑入口处           | At the building entrance              |
| 远景中 | 在远景中，作为比例参考 | In the distance, for scale reference  |
| 前景中 | 在前景中               | In the foreground                     |

### 活动类型 [活动类型]

| 选项 | 中文     | 英文                        |
| ---- | -------- | --------------------------- |
| 散步 | 休闲散步 | Walking, strolling casually |
| 观赏 | 驻足观赏 | Standing and admiring       |
| 交谈 | 交谈     | Chatting, conversing        |
| 休息 | 坐着休息 | Sitting, relaxing           |
| 运动 | 运动锻炼 | Exercising, jogging         |
| 骑车 | 骑自行车 | Cycling                     |
| 野餐 | 野餐     | Picnicking                  |
| 拍照 | 拍照     | Taking photos               |
| 遛狗 | 遛狗     | Walking dogs                |
| 用餐 | 户外用餐 | Outdoor dining              |

### 微场景描述 [微场景描述]

> ⭐ **这是让画面从"效果图"变成"生活场景"的关键**

| 场景类型 | 描述模板                                                 |
| -------- | -------------------------------------------------------- |
| 咖啡馆   | 左边沿街是咖啡店，有外摆桌椅和简约白色阳伞，有人在喝咖啡 |
| 度假休闲 | 栈道上有人在休闲躺椅上休息，有小茶几和鸡尾酒，氛围轻松   |
| 沙滩活动 | 沙滩上有人在打沙滩排球，有热闹的沙滩活动                 |
| 校园生活 | 学生们在草坪上野餐，有人在读书                           |
| 儿童游乐 | 有儿童在嬉戏玩耍                                         |
| 运动场景 | 前景有一位运动员正在跳远，沙坑有黄沙轻微泛起在空气中     |
| 商务场景 | 商务人士正在快步走向入口                                 |
| 艺术活动 | 广场上有街头艺人表演                                     |
| 市集活动 | 有小型市集，彩色帐篷                                     |
| 等候场景 | 有人在入口处等候                                         |

---

## 📖 故事层 | Story Layer（写实模式必填）

> **故事性是让效果图从"技术展示"变成"情感触动"的关键**
>
> 故事 = 时间点 + 人物 + 正在发生的事 + 情绪氛围
>
> 不是在画一个"建筑"，而是在画一个**"时刻"**

> **Narrative Gate Rule (Mandatory for photorealistic):**
> - 必须先确定唯一主事件（Primary Beat）。
> - 必须给出 Story Card：`Where/When/Who/What/Why/Mood/Evidence(>=2)`。
> - 若主事件冲突，禁止直接输出写实版。

### 填空模板

```text
【故事层】
这是[时间故事]的时刻，[时间暗示的情绪]。
[人物微叙事：具体人物+动作+细节]。
[空间正在发生：某个位置正在进行的活动]。
[自然动态：自然元素的动态变化]。
建筑的[特征]仿佛在说"[拟人化表达]"。
```

### Story Card 模板（生成前）

```text
Where: [建筑类型/功能]
When: [时段+天气]
Who: [主体人群]
What (Primary Beat): [唯一主事件]
Why: [行为动机]
Mood: [目标情绪]
Evidence: [证据1], [证据2], ...
```

### Level 1：时间故事

| 时刻     | 暗示的故事             | 情绪       |
| -------- | ---------------------- | ---------- |
| 清晨薄雾 | 新的一天开始，宁静等待 | 希望、清新 |
| 正午阳光 | 日常运作中             | 明快、确定 |
| 黄昏金光 | 一天结束，归家时刻     | 温暖、怀旧 |
| 蓝调时刻 | 日夜过渡，介于之间     | 神秘、沉思 |
| 雨后湿润 | 刚刚经历了什么         | 洗净、重生 |

### Level 2：人物微叙事

| ❌ 缺乏故事  | ✅ 有故事性                                      |
| ------------ | ------------------------------------------------ |
| 几个人在走路 | 一对情侣正携手沿着水边漫步，偶尔驻足交谈         |
| 有人坐着     | 一位老人独自坐在长椅上望着远方，手边放着翻开的书 |
| 有人喝咖啡   | 阳伞下朋友们正举杯庆祝，桌上散落着刚拆开的礼物   |
| 有儿童       | 小女孩正追逐肥皂泡，身后是追赶她的金毛猎犬       |

### Level 3：空间正在发生

| 空间 | 故事性描述                                     |
| ---- | ---------------------------------------------- |
| 入口 | 入口处人流三三两两涌出，刚结束的展览正在落幕   |
| 广场 | 广场一角正在布置临时市集，彩色帐篷像一朵朵蘑菇 |
| 水边 | 水边芦苇随风轻摆，一只白鹭正静静伫立           |
| 屋顶 | 屋顶边缘有人倚着栏杆眺望城市天际线             |

### Level 4：自然动态

| 元素 | 故事性描述                               |
| ---- | ---------------------------------------- |
| 树   | 秋风吹过，金黄落叶正飘落在行人肩头       |
| 水   | 涟漪从远处传来，似乎有鱼儿刚跃出水面     |
| 光   | 阳光穿过云层缝隙，在草地上画出一道道光带 |
| 鸟   | 一群白鸽刚从广场惊起，在建筑背后盘旋     |

### 完整故事描述范例

```text
这是一个雨后的黄昏，空气中还弥漫着潮湿的气息。

建筑入口处，一对年轻情侣正驻足分享一把伞，似乎在讨论是否要进去躲雨。
广场一角的咖啡店外摆区，服务生正在擦拭被雨水打湿的桌椅，为晚间营业做准备。
远处草坪上，一位穿黄色雨衣的小女孩正踩着水洼玩耍，身后的父亲手持相机记录这一刻。

夕阳从云层缝隙中透出，在湿润的地面上映出金色光斑。
几只麻雀从屋檐下飞出，寻找雨后的虫子。
```

---

## 7️⃣ 输出控制 | Output Control

### 填空模板

```
画面比例[比例]，采用[渲染风格]，[额外技术要求]。
```

### 比例 [比例]

| 选项       | 适用场景        | 英文                          |
| ---------- | --------------- | ----------------------------- |
| 4:3横向    | 标准效果图      | Aspect ratio 4:3 landscape    |
| 3:4竖向    | 社交媒体、塔楼  | Aspect ratio 3:4 portrait     |
| 1:1方形    | Instagram、封面 | Aspect ratio 1:1 square       |
| 16:9宽幅   | 电影感、横幅    | Aspect ratio 16:9 widescreen  |
| 2.35:1超宽 | 电影级全景      | Aspect ratio 2.35:1 cinematic |

### 渲染风格 [渲染风格]

| 选项     | 中文描述                    | 英文                             |
| -------- | --------------------------- | -------------------------------- |
| MIR风格  | MIR效果图公司风格，低饱和度 | MIR rendering style, muted tones |
| 电影感   | 电影感构图，戏剧性          | Cinematic, dramatic composition  |
| 建筑摄影 | 建筑摄影风格                | Architectural photography style  |
| 虚幻引擎 | 虚幻引擎5渲染               | Unreal Engine 5 render           |
| 真实摄影 | 照片级真实                  | Photo-realistic, camera capture  |

### 额外技术要求 [额外技术要求]

| 选项     | 中文         | 英文                          |
| -------- | ------------ | ----------------------------- |
| HDR      | 高动态范围   | High dynamic range (HDR)      |
| 景深     | 浅景深虚化   | Shallow depth of field, bokeh |
| 长曝光   | 长曝光车轨   | Long exposure, light trails   |
| 黑白     | 黑白图像     | Black and white image         |
| 全局光照 | 全局光照效果 | Global illumination           |

---

## 8️⃣ 负面提示词 | Negative Prompts

### 填空模板

```
负面提示词：[要排除的元素列表]
```

### 通用负面提示词（直接使用）

```
Negative prompt: blurry, low resolution, noise, watermark, text, 
distorted perspective, cartoon style, oversaturated colors, 
ugly, deformed, low quality, overexposed, pixelated,
inconsistent shadows, impossible reflection direction, floating structure,
gravity-defying elements, impossible sun-moon co-existence.
```

### 场景特定排除词

| 想要效果 | 应排除（中文）           | 应排除（英文）                                |
| -------- | ------------------------ | --------------------------------------------- |
| 白天场景 | 夜景，霓虹灯，人造灯光   | night scene, neon lights, artificial lighting |
| 宁静氛围 | 拥挤人群，繁忙交通，汽车 | crowded, busy traffic, cars                   |
| 自然环境 | 城市背景，高层摩天大楼   | urban jungle, skyscrapers                     |
| 极简风格 | 复杂装饰，巴洛克风格     | ornate decoration, baroque                    |
| 真实渲染 | 卡通风格，手绘草图感     | cartoon style, sketch look, hand-drawn        |
| 现代建筑 | 古典柱廊，哥特式         | classical columns, gothic                     |
| 高质量   | 低分辨率，模糊，过曝     | low resolution, blurry, overexposed           |
| 地球环境 | 科幻元素，外星球         | sci-fi elements, alien, futuristic            |
| 夜景/蓝调 | 正午太阳，晴空硬阴影     | bright midday sun, hard noon shadows          |
| 阴天漫射 | 强直射阳光，强烈硬阴影   | direct sunlight, harsh hard shadows           |
| 雨后湿润 | 完全干燥地面，无任何反射 | fully dry ground, no reflections              |
| 浓雾氛围 | 超清远景天际线，无衰减   | crystal-clear far skyline, no depth fade      |

---

# ✅ 快速检查清单 | Quick Checklist

写完prompt后，逐项检查：

- [ ] ✅ 视角锁定了吗？（前提控制）
- [ ] ✅ 建筑类型和风格明确了吗？（主体定义）
- [ ] ✅ 时间和光线描述了吗？（光线与氛围）
- [ ] ✅ 受光面和阴影的颜色写了吗？（光线与氛围）
- [ ] ✅ 主叙事事件是否唯一清晰？（Narrative Gate）
- [ ] ✅ Story Card 是否完整（Where/When/Who/What/Why/Mood/Evidence>=2）？（Narrative Gate）
- [ ] ✅ 情绪是否由光线+行为+构图共同支持？（Narrative Gate）
- [ ] ✅ 若宣称写实叙事，是否满足 `N0=0 且 Narrative Score>=80`？（Narrative Gate）
- [ ] ✅ 时间、天气、光影是否物理一致？（Physics Gate）
- [ ] ✅ 阴影方向与主光源方向一致吗？（Physics Gate）
- [ ] ✅ 材质湿度与地面反射描述一致吗？（Physics Gate）
- [ ] ✅ 室内自然光是否存在真实入射路径（窗/天窗/开口）？（Physics Gate）
- [ ] ✅ 同一材质是否出现互斥光学属性（如 matte + mirror）？（Physics Gate）
- [ ] ✅ 镜头语言是否单一一致（避免广角与长焦同帧冲突）？（Physics Gate）
- [ ] ✅ 若宣称 photorealistic，是否满足 `P0=0 且 Physics Score>=85`？（Physics Gate）
- [ ] ✅ 主材质的纹理和分缝写了吗？（材质细节）
- [ ] ✅ 前景有元素吗？（环境与构图）
- [ ] ✅ 中景有树木或框架吗？（环境与构图）
- [ ] ✅ 人物密度和活动写了吗？（配景与叙事）
- [ ] ✅ 有微场景/生活感吗？（配景与叙事）
- [ ] ✅ 人物行为与天气/时段匹配吗？（Story Coupling）
- [ ] ✅ 负面提示词写了吗？（负面提示词）

---

# 📚 完整案例 | Full Example

### 案例：清晨办公建筑（按模板填写）

```
【0. 前提控制】
根据这张图片生成一张建筑渲染图，不要更换视角，严格遵守原图的构图。
超级写实，高级的建筑渲染图，高分辨率，高度详细，清晰对焦，
8k resolution，masterpiece，intricate details，photorealistic，detailed texture。
Strictly follow the perspective of the reference sketch, Keep exact geometry, 
Do not change the camera angle.
Ensure physically plausible lighting/material behavior and consistent shadow-reflection logic.

【1. 主体定义】
现代主义办公建筑，呈现城市景观，
整体形态为水平延展的线性布局，参考MIR效果图公司风格的设计风格，采用35mm拍摄。

【2. 光线与氛围】
画面时间为柔和的清晨光线，天气呈现薄雾弥漫，光线从画面正中间柔和洒过来，
整体色温中性偏暖，画面氛围清新宁静。
受光面呈现柔和的淡金色光泽，阴影处呈现淡淡的蓝灰色，形成柔和的冷暖过渡。

【3. 建筑特征】
建筑体量尺度适中，线条硬朗直线条，形体呈现简洁纯粹的几何方盒。
立面采用通高玻璃幕墙配合垂直金属格栅，具有重复的韵律感，整体设计简洁纯粹。

【4. 材质细节】
建筑外墙采用高透玻璃幕墙与垂直金属格栅，材料干净整洁，呈现银白色，
有细腻的竖向线条，竖向分缝，有细腻的反光变化，表面呈现出缎面光泽。
次要材质为阳极氧化铝板，位于屋顶和入口雨棚，呈现哑光银色效果。
地面铺装为高级的瑞士石丁铺装，有少量积水倒影明显。

【5. 环境与构图】
前景有绿化带和自行车道标志，呈现修剪整齐的状态，轻微虚化。
中景有几棵大树作为视觉框架，树木枝叶繁茂，遮挡部分天空，阳光穿过树影透出嫩绿色。
背景是蓝天和远处建筑，呈现薄雾笼罩的大气透视效果，越远越淡蓝。

【6. 配景与叙事】
画面中有很多人在休闲散步，在草坪和步道上，正在散步和骑自行车。
左边沿街是咖啡店，有外摆桌椅和简约白色阳伞，有人在喝咖啡。

【7. 输出控制】
画面比例4:3横向，采用建筑摄影风格，高动态范围（HDR）。

【8. 负面提示词】
负面提示词：夜景，霓虹灯，拥挤的人群，汽车，高层摩天大楼，凌乱的杂物，
卡通风格，手绘草图感，低分辨率，模糊，过曝，极度扭曲的透视，科幻元素。
```

---

> **版本**: v1.5  
> **更新日期**: 2026-02-17  
> **核心改进**:
>
> - v1.1: 每个部分增加了填空模板
> - v1.2: 新增第一性原理5W框架 + 故事层章节
> - v1.3: 新增物理一致性约束、冲突排除词、Physics Gate 快速检查项
> - v1.4: 新增 Physics Gate 严格门槛（P0/P1/P2 + Score）与高强度一致性检查项
> - v1.5: 新增 Narrative Gate 必填规则、Story Card 模板与叙事完整性检查项
