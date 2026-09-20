# Git 操作约定

- 不得由 Codex 执行任何 `git push`；推送由用户自行完成。
- 任何推送前必须先执行 `git pull`，解决冲突并完成必要验证后再由用户推送。

# UI 设计约定

- 新建页面或修改页面、组件样式前，必须先阅读项目根目录的 `design.md`，严格遵循其中的颜色、字体、间距、布局、组件和动效规则。
- 优先复用 `frontend/src/index.css` 的设计变量和现有通用组件；新增或调整规范时同步更新 `design.md`，保证所有页面风格一致。

# Vibe-Coding 与 Agent Skill 规范

- 项目内置专属全栈开发与定制技能：**`vibe-coding-lab-orbit`**。
- 规范文件位于 `.agents/skills/vibe-coding-lab-orbit/SKILL.md`，并在 `skills/vibe-coding-lab-orbit/SKILL.md` 镜像归档供开发者查阅。
- 任何 AI Agent（如 Antigravity, Claude Code, Cursor, Windsurf, Codex 等）在承接功能咨询、业务调整、界面重构、特定学科课题组迁移适配、前后端接口对接、数据库迁移或 3D 动画调优等任务时，**必须先阅读并严格遵循该 Skill 的八大标准作业程序 (SOP)**。
- 任何功能开发与代码交付前，必须执行 `npm --prefix frontend test` 确保 369+ 个单元测试 100% 通过。

