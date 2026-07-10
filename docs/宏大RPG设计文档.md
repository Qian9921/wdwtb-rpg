# 《你想成为谁》— 宏大职业 RPG 化 · 详细设计文档

> 版本 v1.1 ｜ 状态：设计定稿待评审 ｜ 面向：实现团队 + 评委 + 多 Agent 协作
>
> 本文档描述如何把《你想成为谁》从"一条线走到底的选项叙事 demo"升级为一款**有自由探索、多天经营、可交互世界、多场景切换**的商业级像素职场 RPG。
>
> **设计铁律**：一切扩展**在现有架构的接口上做加法**，不推倒重来。每引用一处现状都标注 `文件:行号`，改动点明确"新增/扩展/复用"。
>
> **初衷优先**：**[`docs/创作者初衷.md`](./创作者初衷.md)** 是产品北极星。本文所有系统扩展，只为更好服务「大学生真实体验职业生活 → 走出迷茫 → 找到适合且喜欢的职业」。

---

## 第 −1 部分 · 创作者初衷与产品三柱（必读）

### 初衷

> 让刚毕业的大学生可以**真实地体验不同职业的生活和环境**，帮助他们**走出迷茫**，找到**真正适合自己、自己也喜欢的职业**。

气质句（与初衷一体）：

> 你不是要成为一个正确的人，而是要认出那个本来的你。

### 产品三柱（系统扩展时不可拆）

| 柱 | 含义 | 在宏大 RPG 化中的位置 |
|---|---|---|
| **测评** | 霍兰德 RIASEC、大五人格→MBTI 倾向、情境题、初见画像、方向推荐——**科学坐标系** | 进世界之前：认识你是谁，再推荐「试哪一种人生」 |
| **体验** | 办公室、任务链、工单、名册同事、通勤/家、状态与选择——**过日子** | 本文 B1–B4 的全部扩展，都落在这一柱 |
| **报告** | 结局《心之画像》等——把体感译成**可带走的洞见** | 体验必须闭环到「我更清楚适不适合、喜不喜欢」 |

```
测评 → 体验（本文主体）→ 报告
```

**扩展过滤器**：新系统若既不加强真实职业体验，也不加强「适合/喜欢」的澄清，也不服务报告的可解释性——不做。

完整伦理与协作说明见 `创作者初衷.md`。

---

## 第 0 部分 · 现状基线（扩展的地基）

在提任何新东西之前，先锚定我们已经拥有什么。这决定了每个新系统"接在哪"。

### 0.1 场景流转（现状）
```
TitleScene ──开始──> OpeningScene(捏人+7题测评) ──出发──> HubScene(选职业)
   │                                                          │
   └──继续游戏(读档)──────────────────────────────> WorldScene(办公室) <──选职业──┘
                                                        │  ⇅
                                          ┌─────────────┼──────────────┐
                                     MinigameScene  MindscapeScene  PauseScene
                                                        │
                                                        └──剧情走完──> EndingScene
```
- 场景注册在 `src/config.js:33-42`（**不是 main.js**）。
- WorldScene 接收 `{career, deep, act}`（`WorldScene.js:164`）。
- 一幕结束**不切场景**，只是 `_loadNextAct`（`WorldScene.js:832`）换对话数据，玩家始终待在同一张办公室地图里。

### 0.2 八大系统能力清单（现状）
| 系统 | 文件 | 现有能力 | 对本次扩展的价值 |
|---|---|---|---|
| 状态系统 | `StateSystem.js` | 8 值(health/energy/san/stress/skill/performance/money/passion)，EventEmitter，`change`/`threshold` 事件，`restore()` | **多天经营的数值底座**，直接监听事件 |
| 存档 | `SaveSystem.js` | v2 结构含 `stats`，`saveProgress()`，向后兼容 | **跨天/跨场景持久化底座** |
| 对话引擎 | `DialogueEngine.js` | 对话树(节点+选项+effects+condition+action)，打字机，条件门控 | **任务/事件的叙事载体**，扩 `action` 即可挂新玩法 |
| 世界场景 | `WorldScene.js` | 单张 tilemap，双相机，8 向移动，按键交互 NPC，幕推进 | **探索与交互的主舞台** |
| 小游戏 | `MinigameScene.js` | 计时选择题，`onComplete` 反哺状态 | **可交互物件的玩法容器**，已支持回调反哺 |
| 暂停菜单 | `PauseScene.js` | 状态/物品/任务日志/设置 5 面板 | **任务日志面板已有骨架**(`_showQuests:188`)，等真实数据模型 |
| 状态栏 | `StatusBarUI.js` | HUD mini/panel，UI 相机 | **新增天数/任务提示的挂载点** |
| 剧本数据 | `public/data/*.json` | 旗舰 3 职业×5 幕 + 轻量 7 职业单文件 | **叙事内容池**，新内容按同格式扩写 |

### 0.3 现状的"单薄"根因（用户痛点的技术翻译）
1. **世界是布景板**：地图物件（电脑/白板/售货机）已摆放且有碰撞（A3 已修），但**不可交互**——走过去没有任何反馈。
2. **唯一目标是"走近老陈按 E"**：`_updateInteraction`(591) 只认 senior 一个报到点，其余 NPC 只有一句气泡。没有可追踪的任务集合。
3. **时间不存在**：没有"天"的概念，状态只在对话里被动增减，玩家没有"经营一段职业生涯"的节奏感。
4. **空间单一**：只有一层办公室，`_loadNextAct` 换的是对话不是场景，缺少"下班回家/通勤/开会"的空间叙事。

**宏大 RPG 化 = 把布景板变成活的世界**：让世界有事可做（B1 任务）、有时间流动（B2 多天）、有物可玩（B3 交互物件）、有地可去（B4 多场景）。

---

## 第 1 部分 · 宏大愿景与借鉴

### 1.1 一句话愿景
> 你不是在"读一个职场故事"，而是在**经营一段职业人生**——每天上班、接活、搞定或搞砸、下班回家、和家人对话、在通勤地铁上做选择，一天天推进，直到某个抉择时刻，认出那个本来的你。

### 1.2 借鉴对象与吸取点
| 参考作 | 借鉴机制 | 落到本作 |
|---|---|---|
| **星露谷物语** | 每日循环 + 精力条 + 作息节奏 | 每天有"精力预算"，工作/社交/自我提升消耗它；睡觉进入下一天 |
| **中国式家长/中国式人生** | 数值经营 + 阶段抉择 + 多结局 | 8 状态经营，关键节点触发人生抉择分支 |
| **史丹利的寓言/极乐迪斯科** | 环境叙事 + 物件旁白 + 内心独白 | 交互物件触发内心独白（复用 `monologues.json`），环境即角色 |
| **Undertale/传说之下** | 支线 NPC 关系 + 选择的重量 | NPC 支线任务，选择被记录并影响结局文案 |
| **十字军之王/经营模拟** | 任务队列 + 事件驱动 | 任务日志系统，每日随机+剧情事件混合 |

### 1.3 核心循环（Grand Loop）
```
        ┌─────────────────── 一天(Day) ───────────────────┐
        │                                                   │
  [晨] 通勤事件 → [日] 办公室自由探索(接任务/做任务/交互物件/小游戏)
        │                                                   │
        │  ← 状态实时变化(energy消耗, skill/performance积累) │
        │                                                   │
  [晚] 下班回家(家人消息/自我提升) → 结算当日 → 睡觉         │
        │                                                   │
        └──── 天数+1，直到 act 抉择日 → 剧情推进/结局 ───────┘
```
- **旗舰职业**：每"幕(act)"= 若干"天"，幕末是抉择日。5 幕 = 一段完整职业生涯。
- **轻量职业**：压缩为 1 幕若干天，快速体验。

---

## 第 2 部分 · B1 自由探索 + 多任务系统

### 2.1 目标
把"走近老陈按 E"扩展为**一个有多个可接、可追踪、可完成任务的活世界**。玩家在办公室里自由走动，NPC 头顶有任务标记，接了任务后任务日志追踪进度，完成有状态奖励。

### 2.2 数据模型（新增）
新建 `src/systems/QuestSystem.js`（继承 EventEmitter，与 StateSystem 同构）：

```js
// 任务定义（数据驱动，写在 public/data/quests_{career}.json）
{
  "id": "q_first_commit",
  "title": "提交你的第一段代码",
  "giver": "senior",              // NPC id，决定去找谁交付
  "type": "main" | "side" | "daily",
  "desc": "老陈让你改一个小 bug，跑通测试后找他。",
  "trigger": { "act": 1, "day": 1 },   // 何时可接（可选）
  "objectives": [                  // 可多目标
    { "id":"o1", "kind":"talk",     "target":"peer",     "text":"先问同事小林要代码库权限" },
    { "id":"o2", "kind":"minigame", "target":"coding",   "text":"完成 coding 小游戏" },
    { "id":"o3", "kind":"interact", "target":"computer", "text":"在工位电脑上提交" }
  ],
  "reward": { "skill": 5, "performance": 3, "money": 200 },
  "onComplete": { "dialogue": "q_first_commit_done", "unlock": "q_second" }
}
```

**QuestSystem API（新增）**：
| 方法 | 职责 |
|---|---|
| `load(questDefs)` | 从 JSON 装载任务池 |
| `available()` | 返回当前 act/day 可接且未接的任务 |
| `accept(id)` | 接任务，emit `'accepted'` |
| `active()` | 返回进行中任务 |
| `progress(kind, target)` | 上报一个行为(talk/minigame/interact)，匹配 objective 并推进，emit `'progress'`/`'objectiveDone'` |
| `complete(id)` | 全目标完成时调用，发奖励(调 `state.change`)，emit `'completed'` |
| `serialize()` / `restore()` | 存档（accepted/completed id 列表 + objective 进度） |

### 2.3 与现有系统的接线（扩展，不重写）
1. **WorldScene 交互扩展**（`_updateInteraction:591` / `_interact:615`）：
   - NPC 头顶标记逻辑扩展：`QuestSystem.available()` 里 giver=该 NPC → 显示 ❗（可接）；`active()` 里目标指向该 NPC → 显示 ❓（可交付）。复用现有 `senior` 的 ❗ 渲染代码。
   - `_interact` 里：先判断该 NPC 有无可接/可交付任务，有则进任务对话流；无则回落现有寒暄气泡。
2. **对话选项上报**（`DialogueEngine._applyEffects:348` 附近）：给对话节点/选项加可选 `quest` 字段（`{"progress":{"kind":"talk","target":"peer"}}`），对话触发时调 `QuestSystem.progress()`。**扩 action 类型**：`action:"accept_quest:<id>"` / `action:"complete_quest:<id>"`。
3. **小游戏完成上报**（`WorldScene.js:718` onComplete 回调里）：加一行 `this.questSystem.progress('minigame', type)`。
4. **任务日志面板落地**（`PauseScene._showQuests:188`）：把硬编码 `goalByAct` 替换为读 `QuestSystem.active()` + `available()` + `completed()`，渲染真实任务列表（标题/描述/目标勾选进度）。**这是把已有骨架填成真系统**。
5. **HUD 提示**（`StatusBarUI`）：新增"当前主线任务"一行常驻提示 + 任务更新时的 toast。

### 2.4 内容量（首版）
- 旗舰职业每幕 3-5 个任务（1 主线 + 2-4 支线），5 幕共 ~20 任务。
- 轻量职业每职业 3-4 个任务。
- 首版先做 programmer 全量 + 其余职业各 1 幕，验证系统后批量扩写（委派 Sonnet 按模板生成）。

### 2.5 验收标准
- [ ] 走进办公室，至少 2 个 NPC 头顶有 ❗，接任务后变 ❓（交付点）。
- [ ] 接任务 → 任务日志(暂停菜单)出现该任务 + 目标清单。
- [ ] 完成一个 talk/minigame/interact 目标，日志实时勾选。
- [ ] 全目标完成回交 → 状态数值按 reward 变化 + 解锁后续任务。
- [ ] 存档后重进，已接/已完成任务状态正确恢复。
- [ ] puppeteer E2E：脚本驱动接任务→完成→交付全链路 0 报错。

---

## 第 3 部分 · B2 多天循环系统

### 3.1 目标
引入"天(Day)"作为核心时间单位。每天有作息节奏（晨/日/晚），状态跨天累积经营，天数推进剧情。让玩家感到"我在过一段真实的职业时光"。

### 3.2 数据模型（新增）
新建 `src/systems/DaySystem.js`（继承 EventEmitter）：

```js
{
  day: 1,                    // 全局天数
  phase: 'work',             // 'commute' | 'work' | 'home'（晨/日/晚）
  actDayMap: {               // 每幕占几天（数据驱动）
    1: 3, 2: 4, 3: 5, 4: 4, 5: 2   // 旗舰：共 18 天/职业生涯
  },
  dayInAct: 1,               // 当前幕内第几天
  energyBudget: 100          // 每日精力预算，行为消耗，归零强制下班
}
```

**DaySystem API**：
| 方法 | 职责 |
|---|---|
| `startDay()` | 开新一天：重置 energyBudget，emit `'dayStart'`，触发晨间通勤事件 |
| `spendEnergy(n)` | 行为消耗精力，归零 emit `'exhausted'`（强制进入 home 阶段） |
| `advancePhase()` | commute→work→home 推进，emit `'phaseChange'` |
| `endDay()` | 结算当日(状态自然回落/恢复)，day+1；若 dayInAct 超过 actDayMap[act] → emit `'actEnd'`(触发幕抉择剧情) |
| `serialize()`/`restore()` | 存档 |

### 3.3 每日节奏设计
| 阶段 | 场景 | 内容 |
|---|---|---|
| **晨·通勤** | 地铁场景(B4) 或 快速事件卡 | 随机通勤事件（1-2 选项，微调状态/心情），复用 DialogueEngine 短对话 |
| **日·工作** | WorldScene 办公室 | 自由探索：接/做任务(B1)、交互物件(B3)、小游戏。精力预算消耗 |
| **晚·回家** | 家场景(B4) | 家人消息(复用 `FamilyMessages.js`)、自我提升选择(花钱/花精力提 skill 或 san)、睡觉进下一天 |

### 3.4 与现有系统的接线
1. **状态跨天经营**：`endDay()` 里做每日结算——如 `stress` 每天 +5（工作累积）、睡觉 `energy` 回满、`san` 视 stress 高低升降。监听 `StateSystem` 已有事件，无需改状态系统。
2. **存档扩展**（`SaveSystem` 用现成 `extra` 字段）：`saveProgress({career, act, stats, extra:{day, dayInAct, phase, quests}})`。**SaveSystem 无需改**，extra 已支持任意字段合并（`SaveSystem.js:38`）。
3. **幕推进解耦**：现在 `next_act` 由剧情 JSON 硬触发（`WorldScene.js:832`）。新方案：`DaySystem.endDay()` 检测 `dayInAct > actDayMap[act]` → emit `'actEnd'` → WorldScene 启动该幕的**抉择剧情**（幕末对话）→ 抉择对话里的 `next_act` 推进。即"天数攒够才解锁幕末抉择"，让幕有厚度。
4. **HUD**（`StatusBarUI`）：新增"第 N 天 · 上午/下午/晚上"顶部显示 + 精力预算条。

### 3.5 验收标准
- [ ] 进入办公室显示"第 1 天 · 工作时段"。
- [ ] 做任务/交互消耗精力，精力条可见减少。
- [ ] 精力耗尽或主动"下班" → 进入回家阶段 → 家人消息/自我提升 → 睡觉 → "第 2 天"。
- [ ] 天数攒够(actDayMap) → 触发幕末抉择剧情 → 剧情推进到下一幕，天数继续累积。
- [ ] 状态跨天正确累积（stress 攀升、睡觉回精力）。
- [ ] 存档记录 day/phase，续档恢复到正确的天与时段。

---

## 第 4 部分 · B3 可交互物件 + 小游戏

### 4.1 目标
让地图上的物件"活"起来——电脑、白板、售货机、绿植、窗户……走近按 E 触发事件、小游戏或内心独白。世界从布景变成可探索的内容层。

### 4.2 数据模型（新增）
新建 `public/data/interactables_{career}.json` + WorldScene 交互物件层：

```js
{
  "computer": {
    "pos": [x, y],            // 或从 tilemap 的 Computer 层自动取（已有该层！）
    "icon": "💻",
    "prompt": "查看工作",
    "action": "minigame:coding",   // 复用现有 action 全集
    "cooldown": "daily",           // 每天可触发一次
    "condition": { "phase": "work" }
  },
  "whiteboard": { "action": "quest_board", "prompt": "看看任务板" },   // 打开任务板 UI
  "vending": { "action": "buy_drink", "prompt": "买瓶饮料", "cost": {"money":-5}, "effect": {"energy":10, "san":3} },
  "window": { "action": "monologue:window_gaze", "prompt": "望向窗外" },  // 内心独白
  "plant": { "action": "water_plant", "prompt": "浇水" },   // 复用 wdwtb_plant 仪式
  "coffee": { "action": "buy_drink", "effect": {"energy":15, "stress":-2} }
}
```

### 4.3 与现有系统的接线（复用度最高的一块）
1. **tilemap 物件层已存在**：`_buildMap`(344) 已加载 `Computer/Whiteboard/VendingMachine` 等层并加了碰撞（A3）。B3 只需给这些层的位置**注册交互点**，不用新建物件。
2. **交互统一入口**（扩展 `_updateInteraction:591`）：现在只扫 NPC，扩展为同时扫"交互物件"，用同一套 RANGE=78 + [E] 提示逻辑。**一套交互框架，NPC 和物件共用**。
3. **action 复用**（`_setupDialogueEvents:702` 的 action 全集）：
   - `minigame:*` → 已支持，直接触发 MinigameScene。
   - `monologue:*` → **新增**：走近窗户/工位触发内心独白（复用 `monologues.json` + DialogueEngine 单人对话）。
   - `buy_drink` → **新增**：简单即时状态交易（花 money 换 energy/san）。
   - `quest_board` → **新增**：白板打开任务板 UI（B1 任务的可视化接取点，不必找 NPC）。
   - `water_plant`/`write_letter` → 复用现有 `_showRitual`(807)。
4. **顺带修 bug**：Explore 发现 `WorldScene.js:737` 调 `DialogueEngine._advanceAfterAction`（不存在）→ mindscape 返回后推进是 no-op。B3 落地时补上该方法或改用现有 `dialogueEnd` 事件推进。

### 4.4 小游戏扩展
- 现有单一"计时选择题"机制（`MinigameScene.js`）保留，扩充题库按职业分（`minigame_{career}.json`）。
- **新增 1-2 种机制**（可选，视工期）：如"节奏点击"(专注力小游戏)、"拖拽整理"(整理工位/文档)，都走 MinigameScene 的 `type` 分发 + `onComplete` 反哺，架构不变。

### 4.5 验收标准
- [ ] 走近电脑/白板/售货机，显示对应 [E] 提示。
- [ ] 电脑 E → 触发 coding 小游戏；售货机 E → 花钱换精力，状态即时变化。
- [ ] 窗户 E → 内心独白（打字机呈现，复用 monologues）。
- [ ] 白板 E → 打开任务板，可浏览/接取任务（与 B1 联动）。
- [ ] 物件冷却生效（每日一次的不能刷）。
- [ ] mindscape 返回后剧情正确推进（修复 no-op bug）。

---

## 第 5 部分 · B4 多场景切换

### 5.1 目标
从"单层办公室"扩展为**多空间的城市生活**：家、通勤地铁、办公室、会议室。用门/楼梯/场景转场衔接，让每日节奏有空间落点。

### 5.2 场景清单（新增）
| 场景 | 复用/新建 | 用途 | 素材来源 |
|---|---|---|---|
| **家(HomeScene)** | 新建（复用 WorldScene 框架） | 晚间：家人消息、自我提升、睡觉进下一天 | SkyOffice 有卧室/客厅 tileset，或 LimeZu Interior |
| **地铁(CommuteScene)** | 新建（轻量，事件卡为主） | 晨间：通勤随机事件 | 简单站台/车厢 tilemap 或纯 UI 事件卡 |
| **办公室(WorldScene)** | 现有 | 白天工作主舞台 | 现有 SkyOffice map |
| **会议室(可选)** | WorldScene 内分区 或 新建 | 剧情关键对话（评审/汇报/抉择） | SkyOffice 会议室区域 |

### 5.3 转场架构（新增）
新建 `src/systems/SceneRouter.js`（薄封装，统一转场）：
```js
SceneRouter.goto(currentScene, 'HomeScene', { day, phase, career, act });
// 内部：淡出 → SaveSystem.saveProgress(保当前状态) → scene.start(目标, payload)
```
- **门/楼梯触发**：在地图边缘/门位置放"传送触发点"（复用交互框架，`action:"goto:HomeScene"`）。
- **每日节奏自动转场**：DaySystem 的 `phaseChange` 事件驱动自动转场（下班自动回家），也支持手动走到门口转场。
- **状态贯穿**：所有场景共享一个 StateSystem 实例的数据（通过存档 stats 传递）。转场前存、转场后 restore，保证数值连续。

### 5.4 与现有系统的接线
1. **WorldScene 已是可复用模板**：HomeScene 可继承其地图加载/移动/交互框架，只换 tilemap + NPC 配置（家人而非同事）。**大量复用 `_buildMap`/`_createPlayer`/`update`**。
2. **场景注册**（`config.js:33-42`）：加 HomeScene/CommuteScene。
3. **主角贴图贯穿**：所有场景读同一 `wdwtb_profile.avatar.skinKey`（现有机制，`_createPlayer:405`）。
4. **家人系统复用**：`FamilyMessages.js` + `PhoneMessage.js` 已有，HomeScene 直接用于晚间家人互动。

### 5.5 验收标准
- [ ] 每日晨→日→晚经过 通勤→办公室→家 三个场景，转场流畅有淡入淡出。
- [ ] 家场景可触发家人对话、自我提升、睡觉（进下一天）。
- [ ] 通勤场景有随机事件（选择影响当日状态）。
- [ ] 跨场景状态数值连续（在办公室涨的 skill，回家仍在）。
- [ ] 主角外观在所有场景一致。
- [ ] 存档在任意场景/时段都能正确续档回原场景。

---

## 第 6 部分 · 实施顺序与里程碑

**总原则**：每阶段独立可玩、可验证、单独 commit + 部署验收（呼应勤 commit 铁律）。分辨率验证 1920×1080 + 1280×720 双档。

| 里程碑 | 内容 | 依赖 | 交付物 |
|---|---|---|---|
| **M1 · B1 任务系统** | QuestSystem + 任务日志面板落地 + NPC 任务标记 + programmer 全量任务 | 无（先做，最独立） | 可接/追踪/完成任务的活办公室 |
| **M2 · B3 交互物件** | 交互框架统一(NPC+物件) + 电脑/白板/售货机/窗户 + 修 mindscape bug | M1(白板接任务) | 可探索的内容层 |
| **M3 · B2 多天循环** | DaySystem + 每日节奏 + 精力预算 + 状态跨天 + 幕末抉择解耦 | M1(每日任务) | "经营一段时光"的节奏 |
| **M4 · B4 多场景** | SceneRouter + HomeScene + CommuteScene + 转场 | M3(节奏驱动转场) | 完整的城市生活空间 |
| **M5 · 内容扩写 + 打磨** | 各职业任务/事件/物件内容批量补齐(委派 Sonnet) + 全链路 E2E + 平衡性调优 | M1-M4 | 商业级完整体验 |

**为什么这个顺序**：B1 最独立（纯加法，不动时间/空间）先落地建立任务骨架；B3 复用 B1 的任务板 + 已有物件层，成本低收益高；B2 依赖前两者提供"每天有事做"；B4 最重，放最后，依赖 B2 的节奏驱动。M5 把系统撑起来后批量填内容——**系统先行、内容后灌**，避免返工。

---

## 第 7 部分 · 风险与约束

| 风险 | 说明 | 对策 |
|---|---|---|
| **范围膨胀** | 4 大系统 + 多职业内容，工作量大 | 系统先做通(单职业验证)，内容委派 Sonnet 按模板批量生成 |
| **存档兼容** | 新增 day/quest 字段 | SaveSystem 已 v2 + extra 兼容；restore 容错脏数据(已有模式) |
| **性能** | 多场景 + 更多物件/NPC | 复用 staticGroup + 双相机(已有)；场景切换时销毁上一场景资源 |
| **美术一致性** | 新场景(家/地铁)需新 tileset | 优先复用 SkyOffice/LimeZu 已有室内素材，MIT 可商用零风险 |
| **平衡性** | 8 状态 × 多天经营易失衡 | M5 专门调优；数值配置数据驱动(JSON)便于迭代 |
| **无运行时 LLM** | 架构约束：不在游戏内实时调 LLM | 所有任务/事件/独白**预生成为 JSON**；AI 只在捏人后生成一次画像(现状 `AIClient.js`) |

---

## 附录 A · 新增文件清单
```
src/systems/QuestSystem.js       # B1 任务系统
src/systems/DaySystem.js         # B2 多天循环
src/systems/SceneRouter.js       # B4 转场路由
src/scenes/HomeScene.js          # B4 家场景
src/scenes/CommuteScene.js       # B4 通勤场景
public/data/quests_{career}.json         # B1 任务数据(按职业)
public/data/interactables_{career}.json  # B3 交互物件配置
public/data/commute_events.json          # B2 通勤事件池
public/data/daily_events.json            # B2 每日随机事件池
```

## 附录 B · 扩展的现有文件清单
```
src/config.js                # 注册 HomeScene/CommuteScene
src/scenes/WorldScene.js     # 交互框架扩展(NPC+物件)、接 Quest/Day 系统、修 _advanceAfterAction bug
src/scenes/PauseScene.js     # _showQuests 换真实 QuestSystem 数据
src/systems/DialogueEngine.js# 对话选项加 quest 上报字段、扩 action 类型
src/systems/StatusBarUI.js   # 加天数/时段/精力/主线任务提示
```

## 附录 C · 新增 action 类型全集（对话/物件驱动）
| action | 触发效果 | 状态 |
|---|---|---|
| `accept_quest:<id>` | 接任务 | 新增 |
| `complete_quest:<id>` | 交付任务 | 新增 |
| `monologue:<key>` | 内心独白(复用 monologues.json) | 新增 |
| `buy_drink` | 花钱换状态 | 新增 |
| `quest_board` | 打开任务板 UI | 新增 |
| `goto:<scene>` | 场景转场 | 新增 |
| `minigame:coding\|review\|affairs` | 小游戏 | 现有 |
| `plant_tree`/`write_letter` | 仪式弹窗 | 现有 |
| `enter_mindscape` | 心象世界 | 现有 |
| `next_act`/`ending` | 幕推进/结局 | 现有 |
| `phone_message` | 家人消息(现有接线，本次启用) | 现有未用 |

---

*本文档为设计蓝图，实现时每个里程碑单独评审。所有数值/内容配置数据驱动，便于快速迭代与平衡调优。*
