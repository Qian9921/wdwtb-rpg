# 你想成为谁

> 腾讯云黑客松 · 职场疗愈叙事像素 RPG  
> 「你不是要成为一个正确的人，而是要认出那个本来的你。」

浏览器里直接玩的**俯视角职场像素 RPG**：上班、接任务、和同事对接、坐工位写代码、下班回家，用选择经营一段职业人生。

---

## 创作者初衷（为什么做这个游戏）

**给刚毕业、还在迷茫的大学生：**

1. **真实体验**不同职业的生活与环境（不是简介、不是鸡汤）；  
2. **帮助走出迷茫**；  
3. **找到真正适合自己、自己也喜欢的职业**。

因此本作不是「通关故事」或「像素炫技」，而是：

> **用像素 RPG 做载体的体验式职业探索与自我澄清工具**——  
> 科学测评给坐标系，职业人生给体感，生成报告给可带走的洞见。

完整表述与协作铁律见：**[`docs/创作者初衷.md`](docs/创作者初衷.md)**（产品北极星，改功能前先读）。

### 产品三柱（不可拆）

| 柱 | 玩家经历 | 解决什么 |
|---|---|---|
| **测评** Assessment | 情境题（底层：霍兰德 RIASEC + 大五人格→MBTI 倾向）→ 初见画像 · 方向推荐 | **适合**：认真对待「你是谁」，玩家不见术语 |
| **体验** Experience | 进办公室过日子：任务链、同事、工位、压力、下班、家人、选择 | **喜欢 / 吃不消**：体感说了算 |
| **报告** Report | 结局《心之画像》：驱动力、消耗源、压力关系、隐藏模式、契合度、一句专属的话 | **不白玩**：体验翻译成自我理解 |

```
测评（认识你）→ 体验（成为几天那种人）→ 报告（回看你是谁）
```

---

## 3 分钟评委试玩路径（推荐）

1. **`npm install && npm run dev`**，浏览器打开控制台里的本地地址（默认 `http://localhost:5173`）。
2. 点 **开始** → 捏人 + 几道测评题（可随便选）→ 职业大厅 **10 职业均可玩工作日循环**：三大深度 ★完整版，其余 ★迷你完整。
3. 每职业 2 个细分方向（测评推荐可改）。例：程序员开发/测试、律师诉讼/非诉、销售大客户/电销…
4. 进办公室后：
   - **WASD** 移动，**E** 交互，**ESC** 菜单，**T** 倾听内心。
   - 找头顶 **❗** 的 **老陈** 报到 / 领主线任务。
   - 按任务提示去找 **小赵 / 小林 / 婷婷 / 周哥**，再回自己工位 **坐下 → 开始工作** 做小游戏。
   - 右上角 **下班回家** 看日报、进下一天；项目进度到里程碑会触发短剧情。
5. 想直接进办公室调试：`http://localhost:5173/?s=WorldScene`（开发用）。

**最短「像在玩游戏」的体验**：程序员完整版 → 接 1 环任务 → 找人对接 → 工位小游戏 → 交付 → 下班。

---

## 操作

| 键 | 作用 |
|---|---|
| WASD / 方向键 | 移动 |
| Shift | 冲刺 |
| E | 交互（NPC / 椅子 / 物件） |
| T | 倾听内心（思维内阁） |
| ESC | 暂停菜单（状态 / 任务日志 / 设置） |
| 触屏 | 左下摇杆 + 交互 / 菜单按钮 |

---

## 核心循环（程序员完整版）

```
报到领任务 → 找具名同事对接(短对话)
    → 回工位做工单/小游戏 → 交付导师
    → 项目进度↑ → 里程碑短剧情
    → 下班日报 → 回家/家人消息 → 下一天
```

- **任务链**：**10 职业全覆盖** — 深度 5 环×2，轻量 3 环×2
- **工单池 / 随机事件 / 名册**：每职业 `work_orders_*` / `office_events_*` / `roster_*`
- **完整度**：程序员/产品/行政 ★完整版；设计师/运营/教师/医护/公务员/销售/律师 ★迷你完整

---

## 开发

```bash
npm install
npm run dev        # 本地开发
npm run build      # 产出 dist/（EdgeOne Pages 等静态部署）
npm test           # 单元 + 内容校验 + 剧情图（默认 CI / 无浏览器也可）
npm run validate   # 仅内容完整性（taskchain↔roster 等）
npm run test:e2e   # 可选：浏览器主线 e2e（自动起 vite + Chromium）
npm run test:all   # npm test && npm run test:e2e
```

### 测试说明

| 命令 | 覆盖 | 依赖 |
|---|---|---|
| `npm test` | 单元 + `validate-content` + `validate-story` | 仅 Node |
| `npm run test:e2e` | 主线 e2e + **产品/律师职业冒烟**（默认 all） | Chromium |
| `npm run test:e2e:main` | 仅程序员主线通关 | Chromium |
| `npm run test:e2e:careers` | 仅产品+律师冒烟 | Chromium |
| `npm run test:all` | 上两者串联 | Node + Chromium |

- 单元：`scripts/test-*.mjs`（状态 / 任务 / 任务链 / 存档 / 天数 / 时段 / 项目 / 独白…）
- 内容：`scripts/validate-content.mjs`（10 职业名册·任务链·工单·事件）
- 剧情图：`scripts/validate-story.mjs`
- **e2e**：`scripts/run-e2e.mjs` 自动起/复用 vite；默认 `E2E_SUITE=all` 跑 `e2e-mainline.cjs` + `e2e-career-smoke.cjs`（产品·biz、律师·litigation）。
- 环境变量：`E2E_BASE_URL`（默认 `http://localhost:5173`）、`E2E_SKIP_SERVER=1`（不自动起服）、`E2E_PORT`
- **评委 / CI 建议**：日常与 PR 用 `npm test`；发版或演示前加跑 `npm run test:e2e`（勿默认塞进无图形环境的 CI，除非装了 Chromium）。

### 架构铁律（改代码前必读）

1. **引擎写一次**：`src/scenes/`、`src/systems/` 共用，不为单职业复制逻辑。
2. **内容数据驱动**：剧情/任务/名册在 `public/data/*.json`，不写死进引擎。
3. **Phaser 文件必须** `import Phaser from 'phaser'`。
4. **大改 WorldScene 前先对齐**：该文件已是主战场，避免与并行工作互相覆盖。

### 目录速查

| 路径 | 作用 |
|---|---|
| `src/scenes/` | 标题 / 开场 / 大厅 / 世界 / 心象 / 小游戏 / 结局… |
| `src/systems/` | 状态、任务、存档、对话、时段、项目进度… |
| `public/data/` | 运行时 JSON 内容 |
| `public/assets/` | 像素素材（LimeZu / SkyOffice 等） |
| `scripts/` | 测试、校验、截图与 e2e |
| `docs/宏大RPG设计文档.md` | 宏大 RPG 化设计蓝图 |

### 存档

- 进度：`localStorage` key `wdwtb_save`（含 `career` / `act` / `subRole` / `quests` / `story` / `project`…）
- 捏人：`wdwtb_profile`
- 标题页「继续游戏」会带回 **subRole + deep**，避免程序员任务链方向丢失。

---

## 技术栈

- Phaser 3 + Vite
- 纯前端 + localStorage
- 可选：腾讯混元 hy3（结局画像 / NPC 记忆台词，失败自动降级）
- 部署：腾讯云 EdgeOne Pages（`base: './'`）

---

## 素材与许可

- 角色 / 室内：LimeZu 等（见游戏内署名）
- 办公室地图：SkyOffice（MIT）
- 中文像素字体：Fusion Pixel（OFL）

---


---

## 黑客松终态验收（演示前勾选）

完整清单见 **[`docs/黑客松终态验收清单.md`](docs/黑客松终态验收清单.md)**。

### 门禁一键

```bash
npm test && npm run test:e2e && npm run build
```

### 最近一次全量跑通（2026-07-11 02:15 ）

| 检查 | 结果 |
|---|---|
| `npm test` | ✅ **18 suites** 全绿（单元 + validate-content + validate-story） |
| `npm run test:e2e` | ✅ **9/9** 主线通关（存档 story / 续档 / 里程碑 act2 / 坏节点） |
| `npm run build` | ✅ `dist/` 产出（~1.67 MB JS gzip ~409 KB；字体运行时加载） |
| 10 职业内容 | ✅ roster + 双任务链 + 工单 + 事件（validate 0 errors） |

### 评委最短路径

1. `npm run dev` → 开始 → 捏人 → **程序员·开发**  
2. 找 ❗ 导师接任务 → 对接同事 → 工位小游戏 → 下班  
3. 有余力：再点一个 **迷你完整** 职业（如律师/设计师）确认能进办公室  

### 已知限制（不挡演示）

- `WorldScene` 体量仍大（已抽 `StoryProgress` / `MinigameFlavor`，并行请避让）  
- e2e 主覆盖程序员线；其它职业靠 validate + 链单测 + 手工冒烟  
- 名次由评委裁定；本仓库保证**可玩、可验、可构建**

## 黑客松一句话

**不是读完一段职场小说，而是用测评认识自己、用几天班试职业、用报告带走洞见——帮迷茫的毕业生找到适合且喜欢的方向。**

（初衷全文与三柱：[`docs/创作者初衷.md`](docs/创作者初衷.md)）
