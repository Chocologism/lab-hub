# LabHub - 学术课题组科研协作平台 / Academic Research Lab Hub

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
  <img src="https://img.shields.io/badge/Non--Profit-Open%20Source-ff69b4.svg" alt="Non-Profit">
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

在高校与科研院所课题组的日常科研协作中，常会遇到一些繁琐却高频的小问题：

1. **文献分享易被冲淡**：在微信群、QQ 群或邮件里随手分享的 arXiv 论文或顶刊链接，往往很快被日常聊天刷过去，缺乏集中归档、标签分类与组内交流记录；
2. **组会排期沟通琐碎**：组会常靠口头通知或共享表格登记，容易发生时间冲突；轮值主讲人有时也会忘记提前填报题目摘要或上传幻灯片；
3. **基础参考资料分散**：经典的参考教材、讲义 PPT 与代码仓库散落在不同网盘或个人电脑中，新人进组时常常需要反复找人索要；
4. **学术报告通知零散**：院系前沿讲座常以海报图片或邮件分发，手动转录至个人日程容易遗漏。

**LabHub** 最初正是为了解决这些实际需求而开发的一个轻量协作工具，将文献推荐、组会排期、资料归档与日程提醒整合在一个界面中，支持本地私有部署，也支持通过 Cloudflare 免费服务托管。

---

## 二、模块设计与系统架构 (Architecture)

系统采用前后端分离架构，提供两种部署形态：
- **自建服务模式**：基于 Python FastAPI 与 SQLite，适合在局域网工作站或云服务器上直接运行；
- **Serverless 托管模式**：基于 Cloudflare Pages Functions、D1 关系数据库与 R2 存储桶，无需自备常开服务器。

```
┌────────────────────────────────────────────────────────────────────────┐
│                          LabHub 前端 (Frontend)                         │
│           Vue 3 + Vite + Tailwind CSS + Three.js + KaTeX                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         ▼                                                     ▼
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│        自建模式 (Self-Hosted)    │  │    Serverless 托管 (Cloudflare)  │
│      FastAPI + SQLite + Docker   │  │     Pages Functions + D1 + R2    │
├──────────────────────────────────┤  ├──────────────────────────────────┤
│ • Python 异步后端 API            │  │ • Cloudflare Pages 静态与边缘函数│
│ • SQLite3 本地单文件数据库       │  │ • Cloudflare D1 边缘关系数据库   │
│ • 本地目录持久化存储             │  │ • Cloudflare R2 对象存储 (免流量)│
└──────────────────────────────────┘  └──────────────────────────────────┘
```

### 核心功能模块

```
• 1. 工作台主页 (Home Dashboard)
  ├─ 快捷入口：一键录入 arXiv 推荐、快速登记组会日程
  ├─ 通知公告：重要截稿日期与讲座滚动的公告栏
  ├─ 每周日程：按周查看全组会议安排与个人倒计时看板
  └─ 个人待办：下一次主讲或文献分享的到期提醒

• 2. 组会与学术日程 (Seminar & Schedule)
  ├─ 视图切换：时间轴、周历及学术会议列表
  ├─ 封面相册：基于 Three.js 实现的 3D 轮播展示海报与近期组会
  ├─ 主讲人填报：到期前提醒主讲人补充题目、摘要与课件链接
  ├─ 日历导出：支持生成标准 iCalendar (.ics) 文件同步至手机或日历软件
  └─ 批量导入：支持解析带有主讲人和主题的 CSV 排期表

• 3. 文献推荐与研讨 (Literature Hub)
  ├─ 自动解析：输入 arXiv 编号/链接或 DOI，异步获取标题、作者与摘要
  ├─ 范围控制：支持“公开推荐”（全组可见）与“定向推荐”（仅指定成员可见）
  ├─ 重点标记：课题组负责人（PI）推荐带有高亮徽章
  └─ 研讨评论：组员标记阅读状态，沉淀简短讨论与笔记

• 4. 教材资料文库 (Resource Hub)
  ├─ 分类归档：按基础理论、专业方向及工具库分门别类
  ├─ 检索定位：支持拼音首字母筛选与常用资料星标收藏
  └─ 资源链接：汇总在线教程、配套 GitHub 代码仓库与下载链接

• 5. 学术邮箱与海报解析 (Mailbox & OCR)
  ├─ 邮箱互联：支持配置高校或研究所 IMAP/SMTP 邮箱
  ├─ 海报识别：提取报告海报中的时间、地点与报告人信息
  └─ 一键入历：确认信息后直接添加到组内公共日程

• 6. 学术 AI 辅助 (AI Assistant)
  ├─ 公式渲染：基于 KaTeX 实时排版 LaTeX 数学公式
  ├─ 翻译与润色：保留专业术语与公式符号的学术翻译
  └─ 接口兼容：支持对接主流大模型 API 服务

• 7. 系统与权限设置 (Settings & Governance)
  ├─ 注册邀请码：内置邀请码验证（默认 LAB-2026），避免无关人员注册
  ├─ 角色管理：管理员 (Admin)、教师/负责人 (Teacher)、组员 (Student) 三级权限
  └─ 界面配置：支持深色/浅色及多套界面主题切换
```

---

## 三、使用手册与快速上手 (User Manual)

### 1. 部署运行方式

#### 方式一：本地脚本启动（推荐体验与开发）

克隆代码后直接运行根目录的启动脚本。脚本会自动检测 Python 环境、安装后端依赖、构建前端并启动服务：

```bash
git clone https://github.com/Chocologism/lab-hub.git
cd lab-hub
chmod +x start.sh
./start.sh
```

服务启动后，浏览器打开 `http://127.0.0.1:8000` 即可访问。

#### 方式二：Docker 容器化部署（适合私有服务器）

仓库内提供配置好的 Dockerfile 与 Docker Compose 编排文件，可在服务器后台运行并自动持久化数据：

```bash
docker compose -f deploy/docker-compose.yml up -d
```

- **服务端口**：默认映射宿主机 `8000` 端口；
- **数据目录**：数据库保存于宿主机 `./data/labhub.db`，容器更新重启不影响已有数据；
- **环境变量**：可在 `deploy/docker-compose.yml` 中修改注册邀请码 `LABHUB_INVITE_CODE` 与密钥 `LABHUB_SECRET_KEY`。

#### 方式三：Cloudflare 托管部署（无需自备服务器）

若没有独立的常开服务器，可部署在 Cloudflare 免费套餐（Pages + D1 数据库 + R2 存储桶）上：

1. **登录 Wrangler**：
   ```bash
   npm install -g wrangler
   npx wrangler login
   ```
2. **创建 D1 数据库与 R2 存储桶**：
   ```bash
   cd frontend
   npx wrangler d1 create labhub-db
   npx wrangler r2 bucket create labhub-files
   npx wrangler d1 execute labhub-db --file=functions/schema.sql
   ```
3. **构建并发布**：
   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name lab-hub
   ```

具体配置说明与数据迁移步骤可参考 [Cloudflare 部署指南](docs/CLOUDFLARE_DEPLOYMENT.md)。

---

### 2. 初始配置说明

- **首次初始化向导**：
  首次安装后，访问 `http://127.0.0.1:8000/setup` 注册第一位系统管理员账号。管理员注册完成后，初始化页面会自动禁用。
- **注册邀请码**：
  新成员注册时需要提供邀请码。系统默认邀请码为 `LAB-2026`，管理员可在系统设置或环境变量中根据需要修改。
- **角色说明**：
  - **管理员**：负责系统设置、成员管理、批量导入排期以及处理组内反馈；
  - **教师 / 课题组长**：可发布置顶通知、重点推荐文献、指派主讲人；
  - **组员**：正常推荐文献、填报主讲信息、借阅教材资料。

---

### 3. 常见工作流程

- **文献推荐与交流**：
  在页面右上角点击“推荐文献”，填入 arXiv 编号或 DOI，系统会自动获取文献标题、作者和摘要。如果文献尚处于讨论初期或只想与特定师兄师姐交流，可选择“定向推荐”仅指定人员可见。
- **组会排期与日历同步**：
  学期初管理员可通过 CSV 文件一次性导入排期表。主讲人会提前收到待办提示，补充摘要和课件。组员可在日程页面点击“导出日历”，将安排同步到手机系统日历中。
- **参考资料整理**：
  在“资料整合”中录入组内常用教材、参考书与讲义链接，支持按拼音字母检索，方便新进组同学查阅。

---

## 四、版权、致谢与开源声明 (Copyright & Acknowledgements)

### 1. 开发方式 (Vibe-Coding)

本项目在开发中采用了 **Vibe-Coding** 方式：由人类开发者把控实际需求、交互流程与整体架构，借助 AI 编程工具进行代码编写、接口联调与测试用例补全，快速完成系统构建与重构。

### 2. AI 辅助开发致谢

在代码编写与测试验证过程中，主要使用了以下两款 AI 工具协助开发：
- **OpenAI Codex**：协助编写后端 API、数据库查询逻辑以及自动化回归测试用例；
- **Google DeepMind Antigravity**：协助梳理前后端架构、编写 Vue 3 组件、打通海报识别流程并完成 Cloudflare Serverless 适配。

### 3. 开源组件与设计致谢

界面的视觉效果与交互体验使用了以下开源项目：
- **Three.js**：用于组会日程海报的 3D 轮播展示；
- **Tailwind CSS**：提供页面样式与响应式布局支持；
- **KaTeX**：提供 LaTeX 数学公式实时排版渲染；
- **Lucide Icons**：提供统一的矢量图标库；
- **Vue 3 & FastAPI**：构成前后端核心技术栈。

### 4. 开源协议与非营利声明

- **MIT License**：本项目基于通用的 [MIT 许可证](LICENSE) 开源，可自由使用、修改与部署；
- **非营利声明**：本项目完全开源，为个人/课题组科研实际需求驱动的非营利工具，不包含任何商业变现或付费功能；
- **欢迎共建**：欢迎提出改进建议、提交 Issue 或发起 Pull Request。

---

# 🇬🇧 English Documentation

## 1. Motivation

In academic research groups, researchers and students often encounter small but recurring collaboration frictions:

1. **Scattered Literature Sharing**: Interesting arXiv preprints or journal papers shared in chat groups quickly get buried under daily messages, lacking a central place for archiving and discussion;
2. **Disorganized Seminar Tracking**: Meeting schedules recorded on spreadsheets or via chat can result in scheduling conflicts, and speakers sometimes forget to fill in titles or upload slides ahead of time;
3. **Fragmented Reference Materials**: Reference textbooks, lecture notes, and tutorial code repositories are scattered across personal computers and drives, making onboarding difficult for new students;
4. **Scattered Colloquium Notices**: Department seminar announcements sent as email attachments or image posters are easily overlooked without proper calendar integration.

**LabHub** was built to address these practical lab needs by organizing paper sharing, seminar schedules, reference materials, and academic reminders in one simple interface. It can be run on a local workstation or deployed serverless on Cloudflare's free tier.

---

## 2. Modular Design & Architecture

LabHub is structured as a decoupled frontend-backend application with two deployment options:
- **Self-Hosted Mode**: Built with Python FastAPI and SQLite, suitable for local workstations or private Linux servers;
- **Serverless Mode**: Built with Cloudflare Pages Functions, D1 database, and R2 storage, requiring no dedicated server hardware.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          LabHub Frontend Interface                     │
│           Vue 3 + Vite + Tailwind CSS + Three.js + KaTeX                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         ▼                                                     ▼
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│   Option A: Self-Hosted / Docker │  │ Option B: Cloudflare Serverless  │
│      FastAPI + SQLite + Docker   │  │    Pages Functions + D1 + R2     │
├──────────────────────────────────┤  ├──────────────────────────────────┤
│ • Python Async backend API       │  │ • Cloudflare Pages & Edge API    │
│ • SQLite3 single-file database   │  │ • Cloudflare D1 SQL database     │
│ • Local disk file storage        │  │ • Cloudflare R2 object storage   │
└──────────────────────────────────┘  └──────────────────────────────────┘
```

### Functional Modules

```
• 1. Home Dashboard
  ├─ Quick Actions: Paste arXiv IDs or add seminar events quickly
  ├─ Notices: Important submission deadlines and rolling announcements
  ├─ Weekly Schedule: Interactive week-by-week group schedule
  └─ Countdown Badges: Timers for upcoming personal talks and journal clubs

• 2. Seminar & Academic Schedule
  ├─ Views: Timeline, Weekly Calendar, and Conference listings
  ├─ 3D Carousel: Three.js cover display for seminar posters
  ├─ Speaker Reminders: Prompts speakers to submit titles, abstracts, and slides
  ├─ Calendar Sync: Standard iCalendar (.ics) export for phone/desktop calendars
  └─ Batch Import: CSV import for semester-long schedules

• 3. Collaborative Literature Hub
  ├─ Auto Metadata: Fetches title, authors, and abstract via arXiv ID or DOI
  ├─ Visibility Control: Public (lab-wide) or Directed (selected peers/advisors)
  ├─ Highlights: Distinct badges for PI-recommended papers
  └─ Discussions: Reading status markers and comments for lab discussions

• 4. Resource & Textbook Hub
  ├─ Categories: Theory, Research Fields, and Computation Tools
  ├─ Quick Search: Alphabetical and pinyin filtering with favorites
  └─ External Links: Summaries of tutorials, lecture slides, and GitHub code

• 5. Mailbox & Poster OCR
  ├─ Mailbox Sync: Connects with university IMAP/SMTP mailboxes
  ├─ Poster OCR: Extracts date, venue, and speaker from seminar posters
  └─ Calendar Addition: One-click addition to the lab calendar

• 6. AI Academic Assistant
  ├─ Formula Rendering: Live KaTeX rendering for LaTeX equations
  ├─ Translation & Polishing: Field-aware translation preserving math symbols
  └─ Provider Support: Compatible with standard LLM endpoints

• 7. System & Permissions
  ├─ Registration Code: Default invite code (LAB-2026) to manage registration
  ├─ Role Hierarchy: Admin, PI/Teacher, and Student roles
  └─ Theme Settings: Light/Dark mode and background theme options
```

---

## 3. User Manual & Getting Started

### 1. Deployment Options

#### Option A: Quick Local Script (Recommended for Evaluation)

Clone the repository and run the start script, which sets up the Python environment, installs dependencies, builds the frontend, and launches the service:

```bash
git clone https://github.com/Chocologism/lab-hub.git
cd lab-hub
chmod +x start.sh
./start.sh
```

Once running, visit `http://127.0.0.1:8000` in your web browser.

#### Option B: Docker Deployment (Recommended for Private Servers)

Use Docker Compose to run LabHub as a persistent service with volume storage:

```bash
docker compose -f deploy/docker-compose.yml up -d
```

- **Port**: Maps to host port `8000` by default;
- **Persistence**: SQLite database is saved to `./data/labhub.db`;
- **Environment**: Adjust `LABHUB_INVITE_CODE` and `LABHUB_SECRET_KEY` in `deploy/docker-compose.yml` as needed.

#### Option C: Cloudflare Serverless (Zero Hardware Cost)

Deploy directly to Cloudflare's free tier (Pages + D1 database + R2 storage):

1. **Log in with Wrangler**:
   ```bash
   npm install -g wrangler
   npx wrangler login
   ```
2. **Create D1 Database & R2 Bucket**:
   ```bash
   cd frontend
   npx wrangler d1 create labhub-db
   npx wrangler r2 bucket create labhub-files
   npx wrangler d1 execute labhub-db --file=functions/schema.sql
   ```
3. **Build & Deploy**:
   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name lab-hub
   ```

For detailed configuration steps, see the [Cloudflare Deployment Guide](docs/CLOUDFLARE_DEPLOYMENT.md).

---

### 2. Initial Setup & Roles

- **First-Time Setup**:
  Visit `http://127.0.0.1:8000/setup` to register the first administrator account. Once registered, this initialization page is automatically disabled.
- **Invite Code**:
  New users need an invite code to register. The default code is `LAB-2026`, which can be changed in the system settings or environment variables.
- **Roles**:
  - **Admin**: System settings, user role management, bulk CSV schedule import, and feedback handling;
  - **Teacher / PI**: Post pinned notices, highlight recommended papers, and assign seminar speakers;
  - **Student**: Share papers, submit seminar information, and access the resource library.

---

### 3. Common Workflows

- **Paper Sharing**:
  Click "Recommend Paper" on the dashboard or library, enter an arXiv ID or DOI, and the metadata will be retrieved automatically. Use "Directed Sharing" to share confidentially with specific colleagues or advisors.
- **Seminar Scheduling**:
  Admins can import semester schedules via CSV. Speakers receive reminders a week before their talk to submit their abstract and slides. Members can export `.ics` files to sync schedules with Apple, Google, or Outlook calendars.
- **Resource Hub**:
  Add recommended textbooks, lecture slides, and GitHub companion code in the resource section for easy reference by new students.

---

## 4. Copyright, Acknowledgements & Open Source Statement

### 1. Development Approach (Vibe-Coding)

This project was developed using a **Vibe-Coding** approach: human developers defined the real-world workflow requirements, interactions, and system architecture, while AI coding assistants supported code implementation, API wiring, and automated test coverage to iterate quickly.

### 2. AI-Assisted Development Acknowledgements

We acknowledge the assistance of the following AI tools during development:
- **OpenAI Codex**: Assisted in writing backend APIs, database query handlers, and automated test suites;
- **Google DeepMind Antigravity**: Assisted in full-stack architecture organization, Vue 3 components, poster OCR processing, and Cloudflare Serverless integration.

### 3. Open Source Projects & UI Libraries

The user interface and animations make use of several open-source libraries:
- **Three.js**: 3D carousel presentation for seminar posters;
- **Tailwind CSS**: Utility-first CSS styling and responsive layout;
- **KaTeX**: Fast real-time LaTeX math rendering;
- **Lucide Icons**: Clean and consistent icon set;
- **Vue 3 & FastAPI**: Core frontend and backend frameworks.

### 4. License & Non-Profit Statement

- **License**: Released under the [MIT License](LICENSE). Free to use, adapt, and self-host;
- **Non-Profit Statement**: This is a 100% open-source, non-profit tool developed for academic research workflows. It contains no commercial promotion, paid features, or monetization;
- **Contributions**: Feedback, issue reports, and pull requests are warmly welcomed.
