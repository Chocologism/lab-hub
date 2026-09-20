---
name: vibe-coding-lab-orbit
description: >-
  LabOrbit 全栈科研协作平台 Vibe-Coding 实战指南与开发技能。
  适用于通过 AI 结对编程对 LabOrbit 进行全生命周期改进：功能询问与架构定位、
  业务功能调整、界面与布局自定义重整、特定课题组（计算机/生物/化学/物理等）一键迁移适配、
  前后端双轨接口对接（FastAPI + Cloudflare Pages Functions + Demo Mock）、
  数据库操作（SQLite + Cloudflare D1）、Three.js 3D 动画与动效调优、设计图标体系扩展，
  以及全流程自动化测试与构建校验。
---

# LabOrbit Vibe-Coding 全栈开发与定制技能手册

本 Skill 为开发者和 AI Agent（如 Antigravity, Claude Code, Cursor, Windsurf, Codex 等）提供利用 **Vibe-Coding（人类主导需求与交互审美 + AI 执行全栈代码研发）** 高效定制、二次开发与课题组迁移的完整标准作业程序（SOP）。

---

## 快速导航

- [一、全栈架构地图与代码定位 (Codebase Navigation)](#一全栈架构地图与代码定位)
- [二、课题组快速适配与自动化重整 (Lab Adaptation Runbook)](#二课题组快速适配与自动化重整)
- [三、全栈双轨功能开发与接口对接 (Full-Stack API Wiring)](#三全栈双轨功能开发与接口对接)
- [四、数据库操作与平滑迁移 (Database Operations)](#四数据库操作与平滑迁移)
- [五、页面布局与视觉重整规范 (UI Customization)](#五页面布局与视觉重整规范)
- [六、3D 动画、微动效与 KaTeX 渲染 (Animations & Graphics)](#六3d-动画微动效与-katex-渲染)
- [七、设计图标体系扩展与品牌替换 (Icons & Visuals)](#七设计图标体系扩展与品牌替换)
- [八、质量门禁与测试验收清单 (Pre-Flight & Verification)](#八质量门禁与测试验收清单)

---

## 一、全栈架构地图与代码定位

在进行任何修改前，通过下表快速定位功能归属文件：

### 1. 前端主视图 (`frontend/src/views/`)

| 视图文件名 | 对应路由 | 功能职责与核心组件 |
| :--- | :--- | :--- |
| `HomeView.vue` | `/` | 工作台看板、每周日程看板、个人到期倒计时、快捷入口 |
| `SeminarView.vue` | `/seminars` | 组会排期时间轴、周历、3D 海报轮播、主讲人填报、CSV 导入、日历导出 |
| `ArxivFeedView.vue` | `/arxiv` | 文献推荐流、arXiv/DOI 自动元数据抓取、公开/定向推荐、组内研讨互动 |
| `LibraryView.vue` | `/library` | 集中式学术文献库、分类来源过滤（推荐/组会/定向）、全文检索与阅读标记 |
| `ResourceHubView.vue` | `/resources` | 资料整合文库、理论/专业方向/工具库分类归档、拼音首字母检索、星标收藏 |
| `MailboxView.vue` | `/mailbox` | 学术邮箱接入（IMAP/POP3/SMTP）、讲座海报多模态视觉识别与一键排期 |
| `AssistantView.vue` | `/assistant` | 学术 AI 结对编程助手、公式排版渲染、学术翻译与润色 |
| `FavoritesView.vue` | `/favorites` | 个人跨模块收藏夹（精选文献、重点组会、经典教程） |
| `FeedbackView.vue` | `/feedback` | 组内成员使用反馈、功能建议与导师答复沟通池 |
| `AccountView.vue` | `/account` | 个人中心、大模型 API Key 配置、密码修改、主题风格选择 |
| `LoginView.vue` | `/login` | 用户登录与注册界面、邀请码验证、WaveInput 动效输入框 |
| `SetupView.vue` | `/setup` | 系统初始化向导（仅用于首次注册第 1 位系统管理员） |

### 2. 关键业务组件 (`frontend/src/components/`)

- `BaseDialog.vue`：全站统一的基础弹窗/抽屉组件（**重点：具备防误关双重坐标判定机制**）；
- `AppIcon.vue`：全站集中式 SVG 矢量图标库，支持 50+ 语义化图标；
- `WaveInput.vue`：动态波浪流光科技感输入框组件；
- `SmartPasteImportModal.vue`：智能粘贴多模态导入弹窗（支持纯文本、排期表与海报截图拖拽）；
- `PendingImportsModal.vue`：协作排期审核队列弹窗（成员提交 -> 待审池 -> 管理员批量审批）；
- `SeminarCarousel3D.vue`：基于 Three.js 开发的 3D 封面透视海报轮播相册；
- `AttachmentLink.vue` / `FileField.vue`：统一附件下载、原图新标签页预览与文件上传字段；
- `SystemTutorialModal.vue`：新手漫游向导组件（关联 `frontend/src/composables/useTutorial.js`）。

### 3. 双轨后端服务架构

LabOrbit 具备 **“本地自建（FastAPI）”** 与 **“Serverless 托管（Cloudflare Pages）”** 两套生产后端，以及一套 **“纯前端演示沙盒（Demo Adapter）”**：

```
                    ┌─────────────────────────┐
                    │ 前端 API 客户端统一分发   │
                    │ frontend/src/api/client │
                    └────────────┬────────────┘
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     ▼                           ▼                           ▼
【自建模式 (FastAPI)】    【托管模式 (Cloudflare)】     【静态演示 (Pages Demo)】
backend/routers/        frontend/functions/api/     frontend/src/mock/
├─ auth.py              ├─ routes/auth.ts           ├─ demoAdapter.js
├─ seminars.py          ├─ routes/seminars.ts       ├─ demoData.js
├─ library.py           ├─ routes/library.ts        └─ isDemo.js
├─ resources.py         ├─ routes/resources.ts
├─ mailbox.py           ├─ routes/mailbox.ts
└─ schedule_imports.py  └─ routes/scheduleImports.ts
```

---

## 二、课题组快速适配与自动化重整

若要将 LabOrbit 适配到特定的高校、院系或具体学科课题组（例如将天体物理课题组迁移为 **计算机视觉 / 自然语言处理 / 生物医药 / 先进材料** 课题组），请按以下流水线执行：

### 1. 修改课题组名称、简称与全局 Meta

- **网页标题与 HTML Meta**：
  编辑 `frontend/index.html`：
  ```html
  <title>YourLabName - 学术科研协作平台</title>
  <meta name="description" content="YourLabName 课题组科研协作工作台" />
  ```
- **工作台展示名称与配置**：
  编辑 `frontend/src/composables/useSiteConfig.js` 与 `backend/database.py` 中的默认站点配置：
  - `lab_name`: 课题组全称（如：`多模态具身智能研究组`）
  - `lab_short_name`: 简称（如：`Embodied-Lab`）
  - `institution`: 依托单位（如：`清华大学计算机系` / `中科院自动化所`）
- **系统注册邀请码**：
  在 `deploy/docker-compose.yml`、`backend/main.py` 及 `frontend/functions/api/routes/auth.ts` 中将默认邀请码 `LAB-2026` 修改为您课题组的专属邀请码（如 `AI-LAB-2026`）。

### 2. 品牌 Logo 与 Favicon 定制

- **主 Logo 文件**：
  - 替换 `docs/images/LO_logo_wide.svg` 为课题组宽版 Logo；
  - 替换 `frontend/public/favicon.ico` 为课题组小标图标；
- **侧边栏品牌图标**：
  - 检查 `frontend/src/App.vue` 中的品牌插槽，可使用 SVG 或直接使用纯 CSS/字体徽标。

### 3. 预设学科数据种子适配 (Seed & Mock Data)

不同学科关心的学术源头与研讨类别不同：
- **后端种子数据**：编辑 `backend/seed.py` 中的 `DEFAULT_CATEGORIES`、`DEFAULT_PAPERS` 与 `DEFAULT_SEMINARS`；
- **纯前端演示数据**：编辑 `frontend/src/mock/demoData.js`：
  - `DEMO_SEMINARS`：替换为对应学科的组会与研讨议题；
  - `DEMO_ARXIV_PAPERS` & `DEMO_LIBRARY_PAPERS`：替换为对应学科的经典论文或最新预印本（如计算机方向替换为 `cs.CV` / `cs.CL`，生物物理方向替换为 `q-bio`）；
  - `DEMO_RESOURCES_CATEGORIES` & `DEMO_BOOKS`：配置组内必读教材（如《深度学习》、《模式识别》等）；
  - `DEMO_EMAILS`：配置代表性的学科会议或学院讲座邮件模板。

### 4. 学术机构邮箱预设适配

若课题组使用特定大学的邮箱后缀，在 `frontend/src/views/MailboxView.vue` 的 `presets` 数组中添加常用预设：
```javascript
{
  name: '清华大学校内邮',
  domain: '@mail.tsinghua.edu.cn',
  imapHost: 'mails.tsinghua.edu.cn',
  popHost: 'mails.tsinghua.edu.cn',
  imapPort: 993,
  popPort: 995
}
```

---

## 三、全栈双轨功能开发与接口对接

当需要为系统添加新功能（例如：“新增文献评级打分”、“为日程添加参会签到”等），**必须遵循「三轨一致性原则（Triple Consistency）」**：

### 1. Python FastAPI 后端实现

1. **Schema 结构定义** (`backend/schemas.py`)：定义 Pydantic 输入输出模型；
2. **数据库模型** (`backend/models.py`)：在 SQLAlchemy ORM 模型中新增字段或关系；
3. **路由处理** (`backend/routers/<feature>.py`)：
   ```python
   @router.post("/items/{item_id}/score", response_model=ItemOut)
   def score_item(
       item_id: int,
       body: ScoreInput,
       current_user: User = Depends(get_current_user),
       db: Session = Depends(get_db)
   ):
       item = db.query(Item).filter(Item.id == item_id).first()
       if not item:
           raise HTTPException(status_code=404, detail="条目不存在")
       item.score = body.score
       db.commit()
       db.refresh(item)
       return item
   ```

### 2. Cloudflare Pages Functions 后端实现

在 `frontend/functions/api/routes/<feature>.ts` 保持相同的 API 契约：
```typescript
app.post('/items/:id/score', async (c) => {
  const user = await requireUser(c)
  const id = c.req.param('id')
  const { score } = await c.req.json()
  
  await c.env.DB.prepare(
    'UPDATE items SET score = ? WHERE id = ?'
  ).bind(score, id).run()
  
  const updated = await c.env.DB.prepare(
    'SELECT * FROM items WHERE id = ?'
  ).bind(id).first()
  
  return c.json(updated)
})
```

### 3. 前端客户端与 Mock 适配层保持同步

1. **更新 API 客户端** (`frontend/src/api/client.js`)：
   ```javascript
   export const itemsApi = {
     score: (id, score) => api.post(`/api/items/${id}/score`, { score })
   }
   ```
2. **更新演示模拟适配器** (`frontend/src/mock/demoAdapter.js`)：
   确保在 GitHub Pages 等纯前端静态环境下模拟接口调用，拦截 `/api/items/:id/score`，持久化修改到 `localStorage` 并返回响应，确保静态体验网站不会因缺失后端而报错。

---

## 四、数据库操作与平滑迁移

### 1. SQLite 自建模式数据库运维

- **本地数据库文件**：默认存储在 `./data/labhub.db`。
- **字段追加策略（加法迁移）**：
  在 `backend/migrations.py` 中编写容错更新逻辑：
  ```python
  def run_migrations(engine):
      with engine.connect() as conn:
          try:
              conn.execute(text("ALTER TABLE items ADD COLUMN score REAL DEFAULT 0.0;"))
              conn.commit()
          except Exception:
              pass  # 字段已存在时安全跳过
  ```

### 2. Cloudflare D1 边缘数据库运维

通过 Wrangler CLI 在 `frontend/` 目录执行：
```bash
cd frontend

# 查看线上数据表字段
npx wrangler d1 execute labhub-db --remote --command="PRAGMA table_info(seminars);"

# 执行无损字段添加
npx wrangler d1 execute labhub-db --remote --command="ALTER TABLE seminars ADD COLUMN custom_tag TEXT DEFAULT '';"

# 执行迁移脚本
npx wrangler d1 execute labhub-db --remote --file=../scripts/your_migration.sql
```
> [!IMPORTANT]
> 严禁在线上直接执行 `DROP TABLE`。涉及字段类型或重构时，一律先新建列并回填默认值。

---

## 五、页面布局与视觉重整规范

LabOrbit 严格贯彻 **Liquid Glass（流动毛玻璃）+ Deep Cyan/Nightfall（深青夜色）** 现代科研美学，所有样式遵循 `design.md`。

### 1. CSS 变量使用准则

切勿直接在组件中使用硬编码颜色，严格调用 CSS 变量：
```css
/* 容器面板与背景 */
background: var(--bg);           /* 主底色 */
background: var(--panel);        /* 业务卡片与内容阅读区 */
background: var(--surface);      /* 输入框、内嵌栏目、筛选背景 */
border: 1px solid var(--line);   /* 标准半透明细边框 */

/* 文字色彩阶梯 */
color: var(--text);              /* 标题与主要高亮文字 */
color: var(--soft);              /* 正文说明、次要文本 */
color: var(--muted);             /* 日期、作者、灰度元数据 */

/* 交互高亮色彩 */
background: var(--accent);       /* 主按钮、重要指示胶囊 */
color: var(--accent-ink);        /* 主按钮上的反色文字 */
color: var(--accent-strong);     /* 鼠标悬停高亮态 */
```

### 2. 弹窗与抽屉（防误关黄金规则）

所有弹窗必须基于 `BaseDialog.vue`，若自定义遮罩层，必须遵循**双重坐标判定机制**，绝不能简单绑定 `@click="close"`：
```javascript
// 避免用户选中文本向左拖拽滑出窗口边界时误触外部遮罩关闭
const isBackdropMouseDown = ref(false)

function onBackdropMouseDown(e) {
  isBackdropMouseDown.value = (e.target === e.currentTarget)
}

function onBackdropClick(e) {
  if (isBackdropMouseDown.value && e.target === e.currentTarget) {
    close()
  }
  isBackdropMouseDown.value = false
}
```

### 3. 响应式布局自适应断点

- **桌面宽屏 (> 1100px)**：双栏自由流式布局，右侧挂载 3D 轮播或日历辅助看板；
- **平板介质 (650px ~ 1100px)**：侧边栏自动收缩，主要卡片采用栅格堆叠；
- **移动端 (< 650px)**：
  - 侧边栏转换为顶部紧凑固定导航条（高 65px）；
  - 卡片 padding 自动收敛为 `14px ~ 16px`；
  - 表单按钮转为 `100%` 满宽堆叠排列。

---

## 六、3D 动画、微动效与 KaTeX 渲染

### 1. Three.js 封面轮播相册定制 (`SeminarCarousel3D.vue`)

- **修改 3D 旋转角度与景深**：
  在 `setupScene()` 中调节摄像机距离与视场角：
  ```javascript
  camera.position.z = 7.5; // 景深距离
  camera.fov = 45;         // 广角透视度
  ```
- **平滑惯性与手势阻尼**：
  调节动画循环中的插值系数（LERP factor）：
  ```javascript
  currentRotation += (targetRotation - currentRotation) * 0.08;
  ```

### 2. 微动效与转场过渡

- 全站卡片统一 Hover 微动效：
  ```css
  .interactive-card {
    transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  }
  .interactive-card:hover {
    transform: translateY(-2px);
    border-color: var(--accent);
  }
  ```
- 遵循用户的 `prefers-reduced-motion` 辅助偏好设置，避免无意义的持续晃动。

### 3. LaTeX 公式排版实时渲染

在文献摘要或研讨卡片中，调用 `frontend/src/utils/latex.js` 的渲染引擎：
```javascript
import { renderLatexFormulas } from '../utils/latex'

const formattedContent = computed(() => {
  return renderLatexFormulas(rawText.value)
})
```
- 支持行内公式 `$E=mc^2$` 与独立块公式 `$$\int_0^\infty ...$$`；
- 数学字体自动加载 KaTeX 矢量 WebFont。

---

## 七、设计图标体系扩展与品牌替换

全站矢量图标由 `frontend/src/components/AppIcon.vue` 统一管理。

### 1. 新增或替换图标

在 `AppIcon.vue` 的 `icons` 映射表中添加语义化键名与 SVG `path`：
```javascript
const icons = {
  // 现有图标...
  dna: '<path d="M2 15c6.667-6 13.333 0 20-6..."/>',
  telescope: '<path d="..."/><path d="..."/>'
}
```

### 2. 调用方式

在任意 Vue 组件中无需重复引入外部图标库，直接调用：
```html
<AppIcon name="telescope" :size="18" class="text-accent" />
```

---

## 八、质量门禁与测试验收清单

Vibe-Coding 的核心是“大胆重构，严格测试”。任何代码交付前必须完整执行以下命令：

### 1. 自动化单元测试全通检查
```bash
npm --prefix frontend test
```
- **合格基准**：57 个测试套件、369+ 个单元测试必须 **100% 全部通过 (Zero Failures)**；
- 若修改了界面文案或数据结构，必须同步更新对应的 `*.test.js` 文件。

### 2. 静态构建与 Pages 生产打包检查
```bash
# 验证标准构建无 TS/SFC/CSS 语法错误
npm --prefix frontend run build

# 验证纯前端 Demo 模式构建无阻断
GITHUB_PAGES=true VITE_DEMO_MODE=true npm --prefix frontend run build
```

### 3. 本地集成启动验证
```bash
chmod +x ./start.sh
./start.sh
```
访问 `http://127.0.0.1:8000`，使用演示账号或初始化注册流程，确认无网络报错与控制台运行时异常。

---

## 结语

遵循此 SOP，无论是通过 AI 代理自动编写扩展，还是人类开发者快速微调，均能保障 LabOrbit 代码风格一致、架构整洁、性能出色且拥有坚固的测试保障。
