# LabHub - 现代学术课题组轻量级科研协作平台 / Modern Academic Research Lab Hub

<p align="center">
  <img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80" alt="LabHub Banner" width="100%" style="border-radius: 12px; max-height: 320px; object-fit: cover;" />
</p>

<p align="center">
  <a href="#-中文文档"><img src="https://img.shields.io/badge/文档-简体中文-blue.svg" alt="Chinese Doc"></a>
  <a href="#-english-documentation"><img src="https://img.shields.io/badge/Document-English-green.svg" alt="English Doc"></a>
  <img src="https://img.shields.io/badge/License-MIT-emerald.svg" alt="License">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Vue.js-3.x-4FC08D.svg?logo=vuedotjs&logoColor=white" alt="Vue 3">
  <img src="https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Cloudflare-D1%20%7C%20R2%20%7C%20Pages-F38020.svg?logo=cloudflare&logoColor=white" alt="Cloudflare">
  <img src="https://img.shields.io/badge/Vibe--Coding-AI--Assisted-8A2BE2.svg" alt="Vibe Coding">
  <img src="https://img.shields.io/badge/Non--Profit-100%25%20Open%20Source-ff69b4.svg" alt="Non-Profit">
</p>

---

## 快速导航 / Quick Navigation

- [🇨🇳 中文文档](#-中文文档)
  - [一、项目初衷 (Motivation)](#一项目初衷-motivation)
  - [二、模块设计与系统架构 (Architecture)](#二模块设计与系统架构-architecture)
  - [三、使用手册与快速上手 (User Manual)](#三使用手册与快速上手-user-manual)
  - [四、版权、致谢与开源声明 (Copyright & Acknowledgements)](#四版权致谢与开源声明-copyright--acknowledgements)
- [🇬🇧 English Documentation](#-english-documentation)
  - [1. Motivation](#1-motivation)
  - [2. Modular Design & Architecture](#2-modular-design--architecture)
  - [3. User Manual & Getting Started](#3-user-manual--getting-started)
  - [4. Copyright, Acknowledgements & Open Source Statement](#4-copyright-acknowledgements--open-source-statement)

---

# 🇨🇳 中文文档

## 一、项目初衷 (Motivation)

在高校与科研院所的高水平实验室、课题组日常运转中，科研人员与研究生长期面临着**流程割裂、信息孤岛、工具碎片化**的痛点：

1. **文献交流随意而零散**：arXiv 最新文献与顶刊论文常常随手转发到微信群、QQ 群或个人邮件中，阅后即焚，极易被日常聊天冲淡，缺乏课题组层面的统一沉淀、分类研讨与持续追踪机制；
2. **组会排期冲突与准备低效**：组会日程通常依赖 Excel 互发或口头沟通，经常遭遇排期撞车；轮值汇报人填报题目与摘要不及时，组员无法提前获取 Slides 预习；
3. **经典教材与科研资料检索困难**：经典教科书、导师专著、讲义 PPT 以及 GitHub 配套代码仓库散落于网盘、私聊文件与硬盘，新人进组时需要反复索要资料，缺乏统一维护的文库；
4. **讲座学术通知大量被淹没**：学术年会、大会海报、院系前沿报告通常以长图或邮件形式分发，缺乏快速自动解析并一键入历的轻量工具；
5. **AI 辅助学术能力缺乏深度结合**：通用 AI 工具割裂于科研业务之外，无法直接在文献流、组会讨论与 LaTeX 公式推导中无缝响应。

**LabHub** 由此应运而生。它致力于为学术课题组提供一个**开箱即用、全流程贯通、高颜值、现代化且零服务器成本**的一站式科研学术协作平台。

---

## 二、模块设计与系统架构 (Architecture)

LabHub 采用高度模块化的前后端分离架构，同时原生支持**自建本地/私有服务器模式**与**Cloudflare 全托管边缘 Serverless 模式**。

```
┌────────────────────────────────────────────────────────────────────────┐
│                                LabHub 前端界面                          │
│     (Vue 3 + Vite + Tailwind CSS + Three.js 3D + KaTeX LaTeX 渲染)     │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
          ┌──────────────────────────┴──────────────────────────┐
          ▼                                                     ▼
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│        方案 A：私有云 / 容器自建    │  │     方案 B：Cloudflare Serverless │
│   (FastAPI + SQLite WAL + Docker)│  │   (Pages Functions + D1 + R2)   │
├──────────────────────────────────┤  ├──────────────────────────────────┤
│ • Python 异步高性能 Web 核心      │  │ • TypeScript 全球边缘毫秒冷启动   │
│ • SQLite3 嵌入式单文件数据库      │  │ • Cloudflare D1 分布式数据库     │
│ • 本地挂载目录文件与海报存储      │  │ • Cloudflare R2 对象存储(免流量) │
└──────────────────────────────────┘  └──────────────────────────────────┘
```

### 核心功能模块设计

```
• 模块 1：工作台主页 (Home Dashboard)
  ├─ 快捷科研行动流（快速粘贴 arXiv 推荐文献、快速登记报告）
  ├─ 全组重要截稿通知与讲座滚动跑马灯 (Notice Marquee)
  ├─ 每周科研日程视图（支持按周左右拖拽钻取）
  └─ 个人最近组会汇报与文献分享倒计时看板

• 模块 2：学术日程与组会系统 (Seminar & Academic Schedule)
  ├─ 三维多视图切换：时间轴 (Timeline)、周日历 (Weekly Calendar) 与学术会议雷达 (Conferences)
  ├─ 3D 封面轮播相册：基于 Three.js 打造的沉浸式学术海报与组会视觉呈现
  ├─ 主讲人填报与待办提醒：自动检测并提示主讲人补充题目与摘要
  ├─ 日历集成与治理：一键导出标准 iCalendar (.ics) 同步至手机日历；管理员排期顺延与冲突检测
  └─ 批量数据导入：支持解析带有主讲人与主题的 Excel / CSV 排期表

• 模块 3：文献推荐与深度研讨 (arXiv Feed & Collaborative Library)
  ├─ 自动解析文献：输入 arXiv 编号/链接或 DOI，异步智能补全标题、作者、分类与摘要
  ├─ 细粒度分发受众：支持“公开推荐”（全组可见）与“定向推荐”（仅指定导师或合作者可见）
  ├─ 导师重点关注徽章：课题组负责人（PI）推荐专属金色高亮流
  ├─ 交互与学术打卡：组员一键标记已读、沉淀多楼层科研研讨评论
  └─ 组会联动：新建组会时可直接链接已有文献，排期与文献库互相钻取

• 模块 4：教材资料与专著文库 (Resource Hub)
  ├─ 体系化分类导航：按基础理论、专业方向与工具库分门别类
  ├─ 快速定位索引：支持拼音首字母智能筛选与星标收藏量排序
  └─ 四维外链矩阵：直接聚合讲义在线教程、习题解答、配套 GitHub 代码仓库与原著下载

• 模块 5：学术邮箱与智能海报解析 (Mailbox & Poster OCR)
  ├─ 邮箱安全互联：支持主流高校及科研院所 IMAP/SMTP 邮箱聚合
  ├─ 智能海报日程提取：多模态 AI 智能提取长图海报关键时间、地点与报告人
  └─ 一键入历与防重排：解析后自动核对去重，一键推送到组内公共日历

• 模块 6：科研 AI 助手 (AI Research Assistant)
  ├─ 复杂公式渲染：KaTeX 实时解析复杂的 LaTeX 数学物理公式推导
  ├─ 双语学术润色与翻译：精准保留术语与公式符号的专业翻译模式
  └─ 多模型供应商兼容：支持接入 OpenAI、DeepSeek 或 Cloudflare Workers AI

• 模块 7：课题组治理与个人定制 (Governance & Customization)
  ├─ 专属注册邀请码：内置邀请码机制（默认 LAB-2026），杜绝未经授权的外人注册
  ├─ 三级权限体系：系统管理员 (Admin)、导师/负责人 (Teacher/PI)、组员 (Student)
  ├─ 个性化外观：微光毛玻璃等多套质感皮肤、自定义动态星空背景
  └─ 全屏实景互动新手引导：高亮聚光灯与动态箭头逐页面带教
```

---

## 三、使用手册与快速上手 (User Manual)

### 1. 部署方式选择

#### 选项 A：极速本地脚本运行（适合开发与体验）

```bash
# 1. 克隆代码仓库
git clone https://github.com/Chocologism/lab-hub.git
cd lab-hub

# 2. 赋予脚本执行权限并启动
chmod +x start.sh
./start.sh
```
启动成功后，浏览器打开 `http://127.0.0.1:8000` 即可开始使用。脚本会自动检测 Python 虚拟环境与依赖项，构建前端静态文件，并启动 Uvicorn 异步服务。

#### 选项 B：Docker 容器化部署（适合私有服务器与长期托管）

仓库内置了标准 Dockerfile 与 Docker Compose 编排文件，支持开箱即用的一键容器化启动与数据持久化：

```bash
# 进入部署目录并启动容器
docker compose -f deploy/docker-compose.yml up -d
```

- **服务端口**：默认绑定宿主机 `8000` 端口；
- **数据持久化**：SQLite 数据库自动保存在本地 `./data/labhub.db`，容器销毁或版本升级数据不丢失；
- **环境变量配置**：可在 `deploy/docker-compose.yml` 中配置 `LABHUB_INVITE_CODE`（注册邀请码）与 `LABHUB_SECRET_KEY`（JWT 签名密钥）。

#### 选项 C：Cloudflare 全托管 Serverless 部署（适合追求零服务器成本与全球直连）

LabHub 原生支持部署至 Cloudflare 边缘计算平台，实现**全天候零物理服务器、零成本、抗断电断网的高可用服务**：

1. **安装依赖与登录**：
   ```bash
   npm install -g wrangler
   npx wrangler login
   ```
2. **初始化 D1 数据库与 R2 存储桶**：
   ```bash
   cd frontend
   npx wrangler d1 create labhub-db
   npx wrangler r2 bucket create labhub-files
   # 执行 D1 初始建表迁移
   npx wrangler d1 execute labhub-db --file=functions/schema.sql
   ```
3. **构建并发布至 Cloudflare Pages**：
   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name lab-hub
   ```
详细步骤与现有 SQLite 数据库无损迁移教程，请参阅完整指南：[Cloudflare 部署指南](docs/CLOUDFLARE_DEPLOYMENT.md)。

---

### 2. 初始配置与凭证说明 (Initial Setup)

- **首次初始化向导**：
  访问 `http://127.0.0.1:8000/setup`（或 Cloudflare 线上网址对应的 `/setup`），系统将引导创建**首位超级管理员 (Admin)** 账号。创建完成后，系统会自动关闭初始化入口以保障安全。
- **课题组专属邀请码**：
  新成员注册时必须填写邀请码。系统默认邀请码为：`LAB-2026`。管理员可随时在系统设置或环境变量中修改。
- **三级角色权限机制**：
  - **管理员 (Admin)**：全局设置、批量导入排期、成员角色晋升/移除、文献管理与全组反馈受理；
  - **导师 / 负责人 (PI / Teacher)**：发表置顶公告、推荐带金色徽章的重点文献、指派组会主讲人；
  - **组员 (Student)**：推荐文献、填写组会题目与摘要、下载资料文库教材、提交反馈建议。

---

### 3. 日常核心协同工作流 (Daily Workflows)

- **文献智能录入与定向研讨**：
  在主页或文献库右上角点击“推荐文献”，直接粘贴 arXiv ID（如 `2312.12345`）或 DOI。系统将后台异步抓取标题、作者及摘要。支持选择**公开推荐**（全组研讨）或**定向推荐**（仅发送给指定导师或合作师兄师妹，保护未发表 idea 的私密交流）。
- **组会排期与 iCalendar 日历同步**：
  管理员可通过 Excel/CSV 批量导入学期排期。主讲人在组会前一周将收到主页待办提醒，点击即可快速填报分享主题与上传 Slide 课件。组员可在组会页面点击“导出日历”，一键将组会日历导入 Apple Calendar、Google Calendar 或 Outlook。
- **专著教材文库检索**：
  进入“资料整合”模块，支持按拼音首字母检索课题组经典书目，并支持查看在线代码库与课件链接。

---

## 四、版权、致谢与开源声明 (Copyright & Acknowledgements)

### 1. Vibe Coding 开发范式

本项目是 **Vibe Coding**（人机协同敏捷创新、意图驱动交付）开发理念的代表性落地实践。通过以人类科研痛点为高维意图引领，借助前沿 AI 编码智能体进行自顶向下的架构演进、逻辑推演与测试闭环，让复杂的全栈学术平台在极短周期内实现工业级的高质量交付。

### 2. 辅助开发与编码智能体致谢

在 LabHub 的全生命周期研发与重构中，特别致谢以下尖端人工智能编码工具的深度辅助支持：
- **OpenAI Codex**：在后端异步 API 设计、权限矩阵安全校验、自动化测试集编排与算法边界测试中提供了强有力的代码生成与智能推断支持。
- **Google DeepMind Antigravity**：在全栈工程架构设计、Vue 3 现代化响应式设计规范重构、多模态海报解析流打通以及 Cloudflare Serverless 双轨架构适配中发挥了关键的架构决策与代码落地作用。

### 3. 开源生态与视觉动画效果致敬

LabHub 的现代化视觉体验离不开全球优秀开源社区的滋养与启发。特别向以下开源技术与动画库致敬：
- **Three.js**：驱动组会日程中极具未来感的 3D 环形交互画廊与沉浸式海报走廊；
- **Tailwind CSS & Glassmorphism UI**：赋予平台微光磨砂玻璃质感、灵动平滑的过渡动画与完美的移动端响应式布局；
- **KaTeX**：提供毫秒级、极速精准的学术 LaTeX 数学公式与物理方程实时排版渲染；
- **Lucide Icons**：为整个学术协作工作台提供风格严谨统一、优雅美观的高清矢量图标体系；
- **Vue 3 & FastAPI**：现代前端渐进式框架与 Python 顶尖高性能异步 Web 框架的完美结合。

### 4. 永久开源与非营利声明 (Non-Profit Statement)

- **MIT 开源协议**：LabHub 采用国际通用的 [MIT 许可证](LICENSE) 彻底开源。您可以自由地商用、修改、分发或私有部署。
- **纯粹非营利倡议**：**本项目完全开源，永久免费，绝不牟利，绝无商业推广或付费暗桩**。本项目的唯一使命是为全球高校、科研院所、前沿实验室及年轻学者提供现代、高效、低成本的科研数字化协作基础设施，加速科学知识的传承与创新。
- **欢迎学术社区共建**：欢迎全球学者、研究生与开发者提交 Pull Request、报告 Issue 或分享您的课题组定制心得！

---

# 🇬🇧 English Documentation

## 1. Motivation

In high-level academic research laboratories, institutes, and research groups worldwide, researchers and graduate students frequently struggle with **fragmented workflows, information silos, and tool sprawl**:

1. **Scattered Literature Sharing**: Interesting arXiv preprints and top-tier journal papers are casually pasted into chat groups or emails. These papers are quickly buried by daily chat messages, lacking centralized archival, thematic categorization, and collective discussion.
2. **Disorganized Seminar Scheduling**: Group meeting schedules often rely on static Excel sheets or ad-hoc verbal agreements, leading to time conflicts and delayed topic/abstract submissions. Group members frequently lack timely access to slides beforehand.
3. **Fragmented Academic Textbooks & Reference Materials**: Classic textbooks, mentor monographs, lecture slides, and companion GitHub repositories are scattered across cloud drives and local hard drives. New students face significant friction requesting onboarding resources.
4. **Overwhelmed Conference & Colloquium Posters**: Academic notices and seminar announcements circulate as long posters or text announcements, lacking lightweight tools to automatically extract event details and sync them with calendars.
5. **Lack of Deep Academic AI Integration**: Generic AI tools operate separately from research activities and cannot seamlessly assist within literature discussions or LaTeX derivations.

**LabHub** is created to resolve these challenges. It aims to deliver an **out-of-the-box, comprehensive, aesthetically pleasing, and zero-server-cost** all-in-one collaborative research platform tailored for academic laboratories.

---

## 2. Modular Design & Architecture

LabHub features a clean, decoupled modular architecture natively supporting both **self-hosted private servers** and **Cloudflare fully managed Serverless deployment**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          LabHub Frontend Interface                     │
│     (Vue 3 + Vite + Tailwind CSS + Three.js 3D + KaTeX LaTeX Rendering)│
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
          ┌──────────────────────────┴──────────────────────────┐
          ▼                                                     ▼
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│   Option A: Self-Hosted / Docker │  │ Option B: Cloudflare Serverless  │
│   (FastAPI + SQLite WAL + Docker)│  │   (Pages Functions + D1 + R2)    │
├──────────────────────────────────┤  ├──────────────────────────────────┤
│ • High-performance Python Async │  │ • Global edge millisecond start  │
│ • Embedded SQLite3 single-file   │  │ • Cloudflare D1 edge SQL database│
│ • Local storage / attached volume│  │ • Cloudflare R2 zero-egress bucket│
└──────────────────────────────────┘  └──────────────────────────────────┘
```

### Core Functional Modules

```
• Module 1: Home Dashboard
  ├─ Quick research action stream (instant arXiv submission & seminar logging)
  ├─ Critical lab deadlines and rolling seminar announcement marquee
  ├─ Weekly research calendar view with interactive week-by-week navigation
  └─ Personal countdown timers for upcoming talks and journal clubs

• Module 2: Seminar & Academic Schedule
  ├─ Multi-dimensional views: Timeline, Weekly Calendar, and Conference Radar
  ├─ Three.js 3D Poster Carousel: Immersive visual presentation for seminar posters
  ├─ Speaker topic filling & automated reminder badges for pending abstracts
  ├─ Calendar integration: One-click standard iCalendar (.ics) export
  └─ Bulk schedule import via Excel / CSV with automatic member account matching

• Module 3: Collaborative Literature Hub (arXiv & Journals)
  ├─ Automatic metadata fetching via arXiv ID or DOI
  ├─ Granular distribution scopes: Public (group-wide) vs. Directed (specific peers)
  ├─ Principal Investigator (PI) highlight badge stream
  ├─ Member check-ins, reading status markers, and threaded academic discussions
  └─ Seamless linking between scheduled seminars and literature entries

• Module 4: Resource Library & Monograph Hub
  ├─ Hierarchical categorization (Fundamental Theory, Specialty Fields, Toolkits)
  ├─ Pinyin & alphabetical quick indexing with favorite bookmarks
  └─ 4D external link matrix (Online tutorials, solutions, GitHub repos, PDF downloads)

• Module 5: Academic Mailbox & Poster OCR
  ├─ Secure integration with university IMAP/SMTP mailboxes
  ├─ Multimodal AI OCR: Automatically extracts time, speaker, and venue from poster images
  └─ One-click calendar sync with deduplication checks

• Module 6: AI Research Assistant
  ├─ KaTeX LaTeX engine: Real-time rendering of complex mathematical & physical equations
  ├─ Bilingual academic polishing and terminology-preserving translation
  └─ Multi-vendor LLM support: OpenAI, DeepSeek, or Cloudflare Workers AI

• Module 7: Governance & Personalization
  ├─ Exclusive lab registration invite code (Default: LAB-2026)
  ├─ 3-tier Role-Based Access Control: Admin, PI / Teacher, and Student
  ├─ Multiple themes: Modern frosted glass (Glassmorphism), dynamic starry sky
  └─ Full-screen interactive onboarding guide with spotlight walkthroughs
```

---

## 3. User Manual & Getting Started

### 1. Deployment Options

#### Option A: Quick Local Script (Ideal for Development & Evaluation)

```bash
# 1. Clone the repository
git clone https://github.com/Chocologism/lab-hub.git
cd lab-hub

# 2. Grant execution permission and launch
chmod +x start.sh
./start.sh
```

Once running, navigate to `http://127.0.0.1:8000` in your browser. The script automatically sets up the Python virtual environment, installs dependencies, compiles the Vue frontend, and launches the FastAPI service.

#### Option B: Docker Deployment (Ideal for Production Servers)

The repository provides a production-ready Dockerfile and Docker Compose configuration with volume persistence:

```bash
# Launch container service
docker compose -f deploy/docker-compose.yml up -d
```

- **Service Port**: Bound to host port `8000` by default.
- **Data Persistence**: SQLite database is persisted under `./data/labhub.db`.
- **Environment Variables**: Customize `LABHUB_INVITE_CODE` and `LABHUB_SECRET_KEY` in `deploy/docker-compose.yml`.

#### Option C: Cloudflare Serverless Deployment (Zero Cost & Global High Availability)

Run LabHub with zero physical server cost on Cloudflare Free Tier:

1. **Install dependencies and login**:
   ```bash
   npm install -g wrangler
   npx wrangler login
   ```
2. **Create D1 Database and R2 Bucket**:
   ```bash
   cd frontend
   npx wrangler d1 create labhub-db
   npx wrangler r2 bucket create labhub-files
   npx wrangler d1 execute labhub-db --file=functions/schema.sql
   ```
3. **Build & Deploy to Cloudflare Pages**:
   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name lab-hub
   ```
For a detailed step-by-step walkthrough, refer to [Cloudflare Deployment Guide](docs/CLOUDFLARE_DEPLOYMENT.md).

---

### 2. Initial Setup & Credentials

- **Initial Setup Wizard**:
  Visit `http://127.0.0.1:8000/setup` (or `/setup` on your deployed domain) on first run to register the **primary Super Admin account**. Once initialized, the setup route is locked down for security.
- **Lab Registration Invite Code**:
  New members must provide an invite code during sign-up. The default invite code is: `LAB-2026`. Admins can customize this code anytime in the System Settings or environment variables.
- **Role Hierarchy**:
  - **Admin**: System governance, bulk seminar import, role elevation, full feedback management.
  - **PI / Teacher**: Publish pinned notices, post highlighted recommendations with gold badge, assign seminar speakers.
  - **Student**: Share literature, fill presentation abstracts, access resource textbooks, and submit feedback.

---

### 3. Daily Workflows

- **Literature Recommendation**:
  Click "Recommend Paper" in the dashboard, input an arXiv ID (e.g., `2312.12345`) or DOI. LabHub automatically fetches metadata. Choose **Public** for whole-group discussion or **Directed** for confidential sharing with selected advisors or peers.
- **Seminar Scheduling & Calendar Sync**:
  Admins can bulk import semester schedules via CSV. Speakers receive automated dashboard reminders to fill in their title and upload slides. Group members can click "Export iCalendar" to sync all seminar events directly into Apple Calendar, Google Calendar, or Outlook.
- **Resource Textbook Library**:
  Browse classic reference textbooks, lecture slides, and GitHub companion repositories with fast alphabetical and pinyin indexing.

---

## 4. Copyright, Acknowledgements & Open Source Statement

### 1. The Vibe Coding Paradigm

LabHub is developed following the **Vibe Coding** paradigm — an agile, intent-driven human-AI co-creation methodology. By expressing academic workflow requirements at a high conceptual level and partnering with cutting-edge AI coding agents for full-stack architecture design, algorithm derivation, and automated regression testing, LabHub achieved enterprise-grade robustness and polish in rapid development cycles.

### 2. AI-Assisted Development Acknowledgements

We gratefully acknowledge the profound assistance of cutting-edge AI coding systems throughout the conception and implementation of LabHub:
- **OpenAI Codex**: Provided indispensable assistance in async backend API architecture, security permission matrix modeling, comprehensive automated testing suites, and algorithmic edge-case validation.
- **Google DeepMind Antigravity**: Played an instrumental role in full-stack system architecture, Vue 3 reactive component design, multimodal poster OCR parsing pipelines, and the dual-track Cloudflare Serverless edge architecture.

### 3. Open Source Ecosystem & Animation Design

The visual polish and dynamic user experience of LabHub are built upon the outstanding contributions of the global open-source community. Special thanks to:
- **Three.js**: Powers the futuristic 3D carousel and immersive interactive poster gallery in our seminar system.
- **Tailwind CSS & Glassmorphism**: Provides sleek frosted-glass aesthetics, silky transitions, and seamless responsive design across desktop and mobile devices.
- **KaTeX**: Delivers blazingly fast, typography-grade real-time LaTeX rendering for complex mathematical and physical formulations.
- **Lucide Icons**: Offers a clean, comprehensive, and consistent modern scientific iconography set.
- **Vue 3 & FastAPI**: The harmonic integration of modern reactive frontend engineering and high-performance Python async backend architectures.

### 4. 100% Free & Open-Source Non-Profit Statement

- **MIT License**: LabHub is licensed under the permissive [MIT License](LICENSE). You are completely free to use, modify, distribute, and self-host this software.
- **Purely Non-Profit Initiative**: **This project is 100% open-source, permanently free, non-profit, and non-commercial**. It contains zero paid features, no monetization, and no advertisements. Its sole objective is to empower academic laboratories, universities, research institutions, and researchers worldwide with modern, elegant, and zero-cost digital infrastructure.
- **Community Contributions**: Contributions, issues, and pull requests from researchers and developers worldwide are warmly welcomed!

