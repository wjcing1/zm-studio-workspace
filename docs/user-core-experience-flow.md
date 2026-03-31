# User Core Experience Flow

这是一张 `汇报展示版` 的用户核心体验流程图，采用 `主线旅程 + 支撑能力` 的表达方式。

![用户核心体验流程图](./user-core-experience-flow.svg)

## Flowchart

```mermaid
flowchart LR
    classDef main fill:#101828,stroke:#475467,color:#F8FAFC,stroke-width:1.5px;
    classDef support fill:#F8FAFC,stroke:#98A2B3,color:#111827,stroke-width:1px;

    subgraph Main["主线旅程"]
        A["1. 开屏进入<br/>建立第一印象与进入动作"]
        B["2. 进入项目总览 / 项目台账<br/>快速定位目标项目"]
        C["3. 打开项目专属画布<br/>进入具体工作现场"]
        D["4. 在画布中组织信息与方案<br/>节点、连线、分组、缩放"]
        E["5. 调用 AI Copilot 共创<br/>理解上下文并直接改板"]
        F["6. 团队共同推进项目<br/>实时看到彼此动作与状态"]
        G["7. 沉淀项目记忆与快照<br/>形成持续可推进的项目上下文"]
        H["8. 下一次继续推进<br/>延续决策、协作与交付"]

        A --> B --> C --> D --> E --> F --> G --> H
        H -. "再次进入" .-> B
    end

    subgraph Support["支撑能力"]
        P["项目数据底座<br/>项目、客户、状态、预算、负责人"]
        S["资产与参考内容<br/>资产库、搜索筛选、资产问答"]
        R["实时协同底座<br/>WebSocket 同步、Presence 感知、快照持久化"]
        M["长期记忆与持久化<br/>Project Memory、Board Memory、历史上下文"]
    end

    P -. "提供项目入口与上下文" .-> B
    P -. "把项目信息带入工作现场" .-> C
    S -. "补充事实、素材与参考" .-> D
    S -. "为 AI 共创提供可调用内容" .-> E
    R -. "支撑多人同时编辑与同步" .-> D
    R -. "让协同过程可见" .-> F
    M -. "保存当前讨论、偏好与决策" .-> G
    M -. "让下次工作可以无缝续上" .-> H

    class A,B,C,D,E,F,G,H main;
    class P,S,R,M support;
```

## One-Line Story

用户从项目入口进入，在空间化画布里组织项目，与 AI 和团队一起推进决策，过程中不断调用已有数据，并把结果沉淀成可持续的项目知识。

## Presenter Notes

- 第一段先讲主线：用户不是在不同工具之间跳转，而是在一个连续空间里推进同一个项目。
- 第二段再讲支撑能力：项目数据、资产数据、实时协同、长期记忆共同托住这条主线。
- 第三段收束价值：这个产品的核心不是单点 AI，也不是单点白板，而是 `项目上下文持续积累的协同工作空间`。
