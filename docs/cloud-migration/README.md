# LabHub 独立上云迁移执行手册

编制日期：2026-09-11。用途：交给有代码、SSH 和云端操作能力的 agent 分阶段执行。

**建议采用腾讯云中国大陆轻量应用服务器，上海或南京，Linux 2 核 4 GB、至少 60 GB SSD，Docker Compose + Caddy + FastAPI + SQLite，域名直接解析到该云服务器，使用独立对象存储保存加密备份。** 服务运行、数据、恢复都不依赖 stb。免费函数平台需要改动数据库、文件上传和邮箱同步，本次优先保持现有业务行为。

当前交付的是执行流程、配置模板和备份工具。没有修改应用逻辑，没有导出真实数据，没有购买或部署云资源，也没有停止 stb 服务。模板中的新变量和接口尚待执行 agent 实现。参见 VALIDATION.md 的实际验证范围。

## 1. 推荐配置和预算

| 项目 | 选定方案 |
| --- | --- |
| 云资源 | 腾讯云 Lighthouse，中国大陆上海或南京；2 vCPU、4 GB RAM、60 GB SSD 起 |
| 带宽 | 先选约 5 Mbps、500 GB/月流量；如果组会上集中下载较多，可按实测升级 |
| 系统 | Ubuntu 24.04 LTS，AMD64；基础镜像、依赖锁和应用镜像均记录版本/摘要 |
| 网站 | 一个 FastAPI 进程同时提供 API 和已编译 Vue 页面；保留现有 SQLite 数据模型 |
| 入口 | 自有域名或获准使用的子域名，DNS 直连，Caddy 管理 HTTPS；应用端口不向公网开放 |
| 持久化 | 云服务器 SSD 块设备上的本地文件系统；不使用 NFS/CFS 网络共享目录存放 WAL 数据库 |
| 备份 | SQLite 一致快照 + manifest，经 restic 加密后传至另一区域的私有 COS 桶 |
| 目标 | 约 30 个注册用户；先以单实例为起点，负载能力必须验收，不能把注册人数当成并发测试 |

2026-09-11 查询的腾讯云官方价格表列有大陆 2 核 4 GB / 60 GB / 5 Mbps / 500 GB 套餐，65 元/月。服务器、普通域名、少量备份合计建议预留约 800–1,200 元/年，这是预算估算，不是报价承诺；购买前复核库存、地区、备案所需购买时长、续费价和超额流量费。[价格表](https://cloud.tencent.com/document/product/1207/73452)

5 Mbps 对一个 15 MB 文件的理想下载时间约为 24 秒，多人同时下载会共享带宽。因此容量充足不等于集中下载一定快。首次购买宜控制承诺周期，但须满足真实备案资源要求。

大陆公开网站上线前需要 ICP 备案。网站实际归属、名称与备案主体要一致，不能假定课题组网站可以直接用个人名义备案；先向接入商确认可行的真实主体。未完成时可以构建、测试和在云端通过受限管理通道演练，不向组员开放。若主体确实不可用，请用户选择后再改成香港等地区，不能悄悄改变数据驻留地区或网站身份。[备案要求](https://cloud.tencent.com/document/faq/243/19630)、[个人/单位主体区别](https://help.aliyun.com/zh/icp-filing/how-to-choose-the-record-type)

香港也能运行相同容器，但腾讯云官方说明所有港澳台/境外轻量节点从大陆跨境访问都可能有延迟和丢包；这不仅是最低价入门套餐的问题。它属于明确更换地区后的备选路径。[网络说明](https://cloud.tencent.com/document/product/1207/50103/)

## 2. 交接事实和不可变边界

以下是 2026-09-11 本会话的实查结果，**后续执行应复核**，不把这些计数当作未来固定期望值。

| 项目 | 当时检查结果 |
| --- | --- |
| 本地仓库 | `/path/to/local/lab-hub` |
| Git 远端 | `https://github.com/<your-username>/lab-hub.git` |
| 本地开发分支 | `main` |
| 文件一致性 | 本地与服务器代码配置核对一致 |
| 服务器身份 | SSH 别名 `prod-server`，`server.example.edu:22`，远端 hostname `server1`，用户 `deploy-user` |
| 源仓库 | `/srv/lab-hub` |
| 源库 | `/srv/lab-hub/backend/labhub.db`；进程打开文件已核对 |
| 业务统计 | 6 个用户，18 场组会，32 条组会分享，3 场台内报告，2 个邮箱配置，103 封缓存邮件，uploaded_files 当时 0 条 |
| 数据状态 | 主文件约 1.45 MB，另有约 1.28 MB WAL；quick_check=ok；所在文件系统为 NFS |
| 本地库 | 5 个用户、3 场组会，且没有邮箱表；不作为迁移源 |

执行边界：

1. 不再使用 stb 托管网站或任何隧道。不在其上启动演练、测试、定时备份、代理或恢复服务。旧服务退役后不得重启。
2. 一次性读取、导出和退役按届时用户的执行授权进行。当前“给出流程”不等于现在执行停服、数据外传或购买。
3. 读取 AGENTS.md；修改前先 pull，Codex 不 push。保护本地未提交变更和 assume-unchanged/skip-worktree 下的真实数据。不要使用 reset/clean 或盲目 stash 二进制数据库。
4. 使用 safe-remote-ops 的主机、路径和校验规则。错误类别不清时不能换成本地库。所有远程命令使用禁 X11、BatchMode、ConnectTimeout 和保活；用已确认的解释器执行检查。
5. 不把数据库、邮件、凭据、真实环境文件、导出的镜像包放进 Git。执行记录只存计数、路径、版本、校验值和结果。
6. 回退只在独立云环境中完成。不能把重启 stb 写成回退步骤。

## 3. 执行前需要落实的输入

把下表写入私有执行记录。可以并行准备代码和离线测试，不用等待所有输入才开始工作。

| 输入 | 需要确定的内容 |
| --- | --- |
| 云账号与预算 | 用户持有的账号、可用地区、月预算、实际资源购买授权；不将账号密码贴入对话 |
| 网站域名 | 实际域名及 DNS 管理方式，域名持有人、续费人、备案主体和进度 |
| 云端访问 | 云服务器公网 IP、SSH 别名/用户名、主机指纹、密钥；不要套用 stb 的用户名或端口 |
| 数据范围 | 一次性迁移的业务库范围；明确邮箱凭据/缓存是否随库迁移。未决定前只做本地代码准备，不擅自丢弃或外传该部分 |
| 源退役窗口 | 何时停止旧网站写入、完成最后一次导出并验证旧服务停用；尽早退役，不为了等备案持续运行旧网站 |
| 恢复凭据 | 独立保存新 JWT 密钥、邮箱加密密钥和备份解密口令；不能仅保存在同一云服务器上 |
| 验收账号 | 为独立测试库提供管理员、两位普通用户、导师角色；真实邮箱联网验收只使用获准的测试邮箱 |

对付款、实名、域名验证等必须由用户完成的步骤，列出具体资源和待办；不向用户索要可以由工具安全配置的秘密明文。禁止冒用单位身份或使用个人备案伪装单位网站。

## 4. 阶段 A：确认代码基线，准备隔离的发布工作区

先只读记录：`git status --short --branch`、`git ls-files -v 'backend/*.db'`、`git remote -v`、`git log -1`，以及 GitHub 当前目标分支 SHA。本地 `backend/labhub.db` 曾被设置 assume-unchanged，status 干净不代表数据未变。

在用户私有、Git 之外的位置备份本地有价值的数据库/未提交文件，然后在原仓库按约定执行 `git pull --no-rebase`。只在目标分支确认后修改；如果发现别人已继续提交，以新代码复核本手册，不强行退回旧 SHA。

建议从经确认的当前发布基线建立 `codex/cloud-migration` 分支或隔离 worktree。代码通过用户自行 push 后的指定分支、或经校验的本地发布包传到云端；不要把“等用户 push”变成无法进行本地构建测试的理由。

产出：`execution-record.md`（不含秘密）、目标源码 SHA、修改文件清单。

## 5. 阶段 B：实现公网部署所需的最小补丁

这里列出的新配置**当前代码不识别**，执行 agent 必须实现并测试后再使用模板。保持前端页面、业务数据和现有功能语义。

| 文件/模块 | 实现要求 | 必须验证 |
| --- | --- | --- |
| `backend/auth.py` | 新增 production 模式；JWT 密钥必填、拒绝仓库默认值和模板占位符；生产只认可配置的新邀请码，移除两个固定兼容邀请码；保持 bcrypt 用户密码哈希有效 | 旧邀请码失效；新邀请码成功；原有用户原密码可登录；缺失/默认密钥导致启动失败 |
| `backend/main.py`、`database.py`、`seed.py` | 实现 `LABHUB_ENV=production`、`REQUIRE_EXISTING_DATABASE=1`；在创建表/seed 之前验证数据目录、非空 SQLite 文件、users 表和至少一个管理员；生产不创建演示数据，不打印密码；保留可审计的加法迁移 | 挂载错误或空目录明确失败，不自动生成“全新正常网站”；副本启动后原有记录保留 |
| `backend/main.py` | 新增 `/api/ready`，只读执行实际 DB 查询；成功返回 `{"status":"ready"}`，失败 503；响应不含路径、邮箱等信息。健康存活接口可保留 | 文件不可读/数据库不可用时 ready 失败，而不只返回固定 healthy |
| CORS 与代理 | 实现 `LABHUB_ALLOWED_ORIGINS` 精确解析；同源前后端无需任意跨域；生产禁止带凭据的 `*`。只有受控 Caddy/本机能接触应用端口 | 浏览器正常登录上传；伪造公网转发头不能绕过限流；8000 不对公网开放 |
| `mailbox_service.py` | 将邮箱加密与 JWT 密钥分离，新增 `LABHUB_MAIL_ENCRYPTION_KEY`；采用经维护的加密库，如 Fernet，密文带 `v2:` 标记；生产写入只使用新格式 | 改 JWT 密钥不破坏邮箱解密；错误邮箱密钥明确失败；不回退到公开旧默认密钥 |
| `routers/mailbox.py` | SSE 复用完整鉴权，包括 `token_version`；前端已发送 Authorization，关闭 query-string token 路径；保留 SSE 心跳和即时进度；限制每用户同时同步数、单次消息数和总耗时，补齐 IMAP 网络超时 | 改密码后的旧 token 无法同步；断线或重复点击不会无限启动线程；进度能逐条到达 |
| 登录/注册/上传/邮箱接口 | 加入适合 30 人的可配置限流和上传/同步额度；正确识别可信代理后的 IP；默认不对普通浏览请求施加严格写操作限额 | 集中登录不被误伤；连续错误登录返回 429；上传拒绝超限；同步并发有上限 |
| 邮箱网络目标 | 保留已核准的实际公网邮件服务；TLS 和证书校验开启，限制允许的协议/端口。禁止用户指定回环、内网、链路本地、云元数据地址，覆盖 IPv6 和 DNS 重绑定 | 合法邮件主机可达；内部地址和恶意 DNS 解析被拒绝；不借 stb 代理回机构内网 |
| Git 与构建 | 数据库和历史副本退出跟踪并留存私有备份；补全 .gitignore/.dockerignore，镜像中不出现数据库、邮件、密钥、开发环境和测试输出 | 从镜像导出/文件清单验证排除生效；不是只看 .dockerignore 文本 |

SSE：Caddy 模板只处理边缘压缩和刷新；后端现有 GZipMiddleware 也需要验证不会缓冲 SSE。若会影响进度，为 `text/event-stream` 绕过压缩，不能仅改代理就宣称完成。

处理历史数据库：先备份，再解除所需 assume-unchanged 标志，以 `git rm --cached` 仅移出索引、更新忽略规则。不得删除用户工作目录数据库。已进入 Git 历史的数据不会因新增忽略规则消失；核对仓库可见性，避免把数据库或镜像公开。需要改写历史时另列专门方案，不能在迁移任务中强推。

依赖：在 Linux AMD64、Python 3.11 的干净构建环境中解析并测试生产依赖，生成 `backend/requirements-prod.lock`；新增加密/限流库也锁定版本。测试依赖与生产依赖分开。不要把 macOS/Conda 的 `pip freeze` 整份复制进去。Node 建议选择仍受支持、且通过项目构建的 22.x 版本；构建时指定并记录实际镜像摘要。

模板 `templates/Dockerfile` 需安装到 `deploy/prod/Dockerfile`；`templates/dockerignore.txt` 的规则合并到仓库根 `.dockerignore`。不要直接从会被排除的 docs 目录构建生产 Dockerfile。生产 Compose 只引用通过测试的镜像，不在启动时执行 npm/pip 安装、拉 Git 或重新初始化数据库。

## 6. 阶段 C：一次性数据导出及 stb 退役

这是源端操作授权范围内的维护步骤。不要运行现有 `deploy_server.sh stop`：它包含宽泛 `pkill -9`，可能影响其他进程。也不要执行 `start.sh`，其中包含构建、checkpoint 和服务启动。

1. 使用 safe-remote-ops probe/inspect 核对 host/user/path。通过运行进程的 cwd、监听 8000 的进程和打开的数据库文件确认真实源库；只读取相关配置，不打印完整环境。
2. 核对可能负责重启此网站的用户级 systemd、nohup/Screen、cron 等精确启动项。不得修改其他科研任务、SSH 服务或系统端口规则。
3. 在已约定窗口，精确停止并禁用该网站的已确认启动机制；对核对过的应用 PID 优先 SIGTERM，等待正常退出。不得按进程名批量 kill，不得自动升级为 SIGKILL。若未正常退出，记录状态并处理该具体进程。
4. 确认该网站停止写入后，用 SQLite backup API 导出最终一致快照。若已必须立即退役，应先停服务再导出，不因云端尚未准备好而重启。在线备份工具也支持服务尚未停止时的预备快照，但最终迁移源必须有清楚的停写边界。
5. 把脚本传到经确认的新临时目录，或经 SSH stdin 执行；用绝对源路径和新目录输出。不要替换原脚本/数据库。下面是**远端模板**，时间戳目录和 Git SHA 应由执行时核对值填写，不照抄历史值：

```bash
python3 /ABSOLUTE/PRIVATE/TOOLS/sqlite_bundle.py snapshot \
  --source /srv/lab-hub/backend/labhub.db \
  --output-dir /ABSOLUTE/PRIVATE/EXPORT/labhub-final-YYYYMMDDTHHMMSSZ \
  --code-sha VERIFIED_40_CHARACTER_GIT_SHA
```

工具使用源库只读连接，不主动 checkpoint 源库；仅在新目录生成独立 `labhub.db` 和 `manifest.json`。如果失败，保留的不完整目录不是成功备份；修复原因后选择新目录重试。完整性失败不能忽略。外键检查若发现历史问题，保留原始快照并单独分析，不能自动删行“修好”。

6. 通过安全传输移到用户本地私有迁移目录（Git 外），源/目标核对文件 SHA-256 和大小，并运行：

```bash
python3 docs/cloud-migration/scripts/sqlite_bundle.py verify \
  --bundle /ABSOLUTE/PRIVATE/MIGRATION/labhub-final-YYYYMMDDTHHMMSSZ
```

7. 原始导出包只读保留。后续在新目录复制它工作；不要把原始包本身挂载进应用，启动迁移会改变文件，使原始校验失效。保存完整表计数、附件条目数/总字节数、代码 SHA 和导出结束时间。
8. 复核旧网站没有监听进程、没有网站自动启动项、沒有隧道/网站 cron。记录精确处置对象和证据。不要删除原科研目录或原始数据；旧网站数据的归档/清理由用户另行决定。

源数据量很小；本阶段导出耗时不应成为延迟退役的理由。真正的停机窗口是“旧站停止写入至新站正式开放”，包含备案等待时可能较长，不能承诺零停机。

## 7. 阶段 D：离线处理邮箱密钥，形成可恢复的发布数据

默认保留获准迁移的数据。若用户选择邮箱重新绑定，明确记录哪些凭据被清空、缓存是否保留，不能默默更改此范围。

保留绑定的执行要求：

1. 实现一次性 `migrate_mail_keys.py`，只接受原始快照的**工作副本**、旧密钥文件和新密钥文件；输出新的数据库文件/目录，拒绝覆盖输入。旧密钥按源代码和源启动配置确认，不猜测。
2. 从已核对的旧 `mailbox_service.py` 提取旧密文读取逻辑，在内存中验证/解密；用新的独立 Fernet 密钥重加密为 `v2:`。不打印明文或密钥，不联网登录邮箱。
3. 转换必须在事务内完成；失败一条即不发布新副本。逐条验证新密钥可解密且明文等价，输出只包含成功/失败计数。既有 v2 密文应有明确幂等处理，不能二次加密。
4. 记录前后完整表计数；用户 ID、角色、bcrypt 哈希、推荐权限、组会和邮件内容保持一致。仅允许计划中的密文字段/迁移元数据变化。
5. 生成与邮件密钥无关的新 JWT 密钥和新邀请码，真实值仅写入 mode 0600 的私有 app.env。模板中的 `REPLACE_...` 必须全部消除，生产启动验证必须拒绝占位符。
6. 以新代码启动独立副本做一次 schema 升级，记录添加的字段/表。再生成一个新的一致备份包作为“首次云端发布基线”，配对该代码和密钥版本。

将旧原始快照、转换后的发布基线分别标识；不要仅留下转换后文件。云端只保存新运行密钥。旧解密材料随原始导出备份加密保存，不能继续用在公网运行环境。

## 8. 阶段 E：建立独立云运行目录并部署镜像

以下路径均指**新云服务器**，不能在 stb 执行。创建前核对 hostname/user/公网 IP、系统和路径，确认不会覆盖已有应用。

```text
/srv/lab-hub/
  ops/                 compose.yaml、Caddyfile、备份脚本等
  config/              app.env、deploy.env、backup.env、备份口令文件（均私有）
  data/                唯一正式业务库 labhub.db 及其 WAL/SHM
  releases/            各版代码SHA、镜像ID/摘要、锁文件、非秘密发布记录
  backups/             新建的本机一致快照临时目录
  restore-drills/      恢复演练目录，与 data 完全分开
```

1. 按 [Docker 官方 Ubuntu 安装说明](https://docs.docker.com/engine/install/ubuntu/) 安装 Engine 和 Compose 插件，记录版本；启用系统重启后的 Docker 服务。不要执行不明来源的一键宝塔脚本。
2. 建立专用管理账户和 SSH 密钥；云防火墙只开放管理来源的 SSH。正式上线时开放 80/443；不开放 8000、数据库端口或 Docker daemon。Docker 端口映射可能绕过部分主机防火墙规则，以云防火墙和实际端口扫描双重验证。
3. 创建上述新目录，`config` 0700/root、真实环境文件 0600/root、`data` 0700/UID 10001。SQLite 需要目录写权限创建 WAL/SHM，不能只让 .db 可写。
4. 确认数据目录底层为正常本地挂载的云块设备文件系统（如 ext4），不是 NFS。容量至少保留 20% 空闲；日志和本机备份要有保留策略。
5. 将模板安装到 ops/config，填入真实值。在同一架构的隔离构建机或云构建工作区构建镜像，明确采用 `linux/amd64`，不能把 Apple Silicon 的 ARM 镜像当作已适配。

构建命令模板（在已完成补丁的发布源码根目录）：

```bash
docker buildx build --platform linux/amd64 --load \
  --build-arg NODE_IMAGE='node:VERIFIED_PATCH-bookworm-slim@sha256:VERIFIED_DIGEST' \
  --build-arg PYTHON_IMAGE='python:VERIFIED_3_11_PATCH-slim-bookworm@sha256:VERIFIED_DIGEST' \
  -f deploy/prod/Dockerfile -t lab-hub:VERIFIED_RELEASE_TAG .
```

基础镜像版本/摘要应实际解析，不把占位符换成随意 `latest`。使用私有镜像仓库，或者 `docker save` → 校验 → SSH 传输 → `docker load`；不必执行 Git push。传输后的镜像 ID/架构必须匹配，且镜像内部不能包含数据库或 .env。

6. 仅在目标 app 停止且 `data` 是明确的新目录时，安装“首次云端发布基线”的数据库工作副本；赋予 10001:10001 / 0600 权限。已有 data 时先备份并采用受控替换，不直接覆盖。
7. 将 `APP_IMAGE` 指向已验收镜像、`CADDY_IMAGE` 指向验证过的版本摘要。下面的 `config --quiet` 用于验证结构，不把含 app.env 的展开配置输出到对话或日志：

```bash
docker compose --env-file /srv/lab-hub/config/deploy.env \
  -f /srv/lab-hub/ops/compose.yaml config --quiet

docker compose --env-file /srv/lab-hub/config/deploy.env \
  -f /srv/lab-hub/ops/compose.yaml up -d app

curl --fail --max-time 5 http://127.0.0.1:8000/api/ready
```

此时只绑定云服务器本机，尚未开放公网；管理员可以用指向**新云服务器**的临时 SSH 端口转发验收。组员正式使用不需要 SSH。

## 9. 阶段 F：测试、数据验收和上线判定

测试不能指向原始快照、stb 服务或正式业务库。现有 backend/conftest.py 会创建独立测试库，但测试启动变量必须显式选择测试模式，避免生产 guard 阻止测试或测试 seed 泄漏至生产。

在隔离 Linux 环境安装锁定的测试依赖（pytest、httpx 等按实需列出），执行并保存退出码：

```bash
LABHUB_ENV=test .venv/bin/python -m pytest backend -q
npm --prefix frontend ci
npm --prefix frontend run build
```

前端工具测试在 frontend 工作目录执行 `npm exec -- vitest run src/utils`。浏览器工作流参照 `frontend/tests/research-workflows.mjs`、`sharing-workflows.mjs`、`visibility-workflow.mjs`、`feed-identity-workflow.mjs`，逐个读取其测试账号和清理行为，再用明确的独立测试地址运行；新增的生产 guard、密钥迁移和公网权限用针对性测试覆盖。测试所需浏览器应显式安装/定位，不能因脚本未找到 Chrome 就省略验收。

| 验收内容 | 合格标准 |
| --- | --- |
| 原始导出 | SHA/大小一致，integrity_check=ok；各表计数与最终源快照对应 |
| 新 schema/重加密 | 原有 ID、角色、密码哈希、业务内容和权限集合相同；只出现计划中的变化；外键无新增问题 |
| 用户体验 | 管理员/普通成员/导师均能登录；首页、组会、台内报告、文献库、收藏、反馈和账户设置可用 |
| 定向隐私 | 用户 B 不能读到只授权给 A 的推荐、推荐语、缓存邮件、反馈或其受限附件；变更权限/重启后仍保持 |
| 上传与下载 | 1 MB、5 MB、接近 15 MiB 的有效文件成功，超过上限失败；经实际域名测试，不只测 localhost；下载权限不放宽 |
| 邮箱同步 | 从云端解析/连接获准的 IMAP/POP3 公网主机；授权测试邮箱可同步，SSE 实时递增，连接中断能受控结束；私网邮箱不可通过 stb 代理补救 |
| 外部文献 | 云端分别实测 arXiv 和 Crossref；失败时有清楚错误，不伪造抓取结果 |
| 配置失败 | 空数据卷、默认 JWT/邀请码、错误邮件密钥会失败；生产不会 seed 演示用户或打印密码 |
| 重启和重建 | 应用重启、容器重建、云主机重启后数据保持、服务恢复；不依赖终端/Screen/nohup |
| 公网边界 | DNS/TLS 正常，8000 不可公网访问；未经登录无法直接下载私有内容；鉴权失败/限流行为正确 |

负载验收只用脱敏/测试库：模拟 30 个活跃浏览会话持续 10 分钟，覆盖首页、列表、文献检索、权限过滤和定时提醒；另做 5 个同时写入动作、3 个同步任务及集中附件下载。记录请求数、成功率、P50/P95、进程 RSS、CPU、磁盘空间和 SQLite 锁错误。

建议应用侧普通 API P95 < 1 秒、端到端普通 API P95 < 2 秒、无 DB 锁相关 5xx；这是假设的验收目标，不是承诺。外部抓取和文件下载分别计时，不混进普通 API 指标。若网络或实际查询超标，定位后调整规格、带宽、索引或并发，不能靠删功能让测试通过。

至少从校园网和手机蜂窝网络各测试一次。真实业务库只做只读核对；需要写入生产演示记录时使用已约定验收账号和清理范围，不运行会批量写入的现有测试脚本。

## 10. 阶段 G：域名、HTTPS 和正式切换

1. 在真实备案和接入条件满足后，设置正式域名 A 记录指向新云服务器。除非已验证 IPv6 入口，先不添加 AAAA，避免部分设备走不可用 IPv6。切换窗口可先用 300 秒 TTL，稳定后恢复常用值。
2. 云防火墙开放 80/443；检查 Caddyfile 和环境变量。使用同一版本的 Caddy 容器执行 `caddy validate`；需要环境变量时通过 Compose 注入，不用把真实值放进命令行。
3. 启动入口：

```bash
docker compose --env-file /srv/lab-hub/config/deploy.env \
  -f /srv/lab-hub/ops/compose.yaml up -d
```

4. 核对正确域名的证书、HTTP→HTTPS、SPA 深链接刷新、上传、鉴权、SSE。Caddy 的 ACME 数据卷需持久化；反复删除它会造成重新申请证书和潜在限额问题。[Caddy HTTPS](https://caddyserver.com/docs/automatic-https)、[流式代理](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
5. 明确将云端切为唯一写入端。新 JWT 密钥使旧会话失效，用户重新登录；账号密码保持。发布时简述入口变更和必要的邮箱重新绑定情况，不泄露内部凭据。
6. 公告内容交给用户或在已明确授权的渠道发送；agent 不擅自给组员发送消息。
7. 记录切换时间、代码 SHA、镜像摘要、DB 备份 ID、密钥版本标识和负责人。复核云端源码、配置、网络代理、定时任务均没有 stb 依赖。

## 11. 阶段 H：独立备份和恢复演练

目标先定为 RPO ≤ 6 小时、恢复目标 RTO ≤ 1 小时，实际值需演练测得。SQLite 快照在云端生成，然后加密传到独立私有 COS；同机器上的一个 .db 副本不能算异地备份。

建议流程：

1. 安装经过版本核对的 restic。建立私有 COS 桶和只对专用前缀有必要权限的访问凭据；凭据存 root:0600 的 backup.env，口令文件另存。参考 [restic S3 兼容存储](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#s3-compatible-storage)配置实际 endpoint、region 和 bucket，不猜测桶地址。
2. `RESTIC_REPOSITORY` 形如 `s3:https://cos.REGION.myqcloud.com/BUCKET-APPID/labhub`；使用实际测试通过的寻址方式。设置 `AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_DEFAULT_REGION`、`RESTIC_PASSWORD_FILE`，真实值不进入脚本、Git 或命令日志。
3. 只有确认是全新仓库才 `restic init`；随后每次先调用 sqlite_bundle.py 生成新一致包，再 verify，然后 restic backup。备份内容包括该包、匹配的发布元数据、锁文件、ops 和恢复所需的 app.env；含秘密的内容只能进入加密仓库。
4. 镜像必须能从私有仓库或经过校验的独立镜像归档恢复；仅备份一个 Git SHA 而没有可取得的代码/依赖不够。备份解密口令与云凭据另存用户密码管理器，不能只在云主机同盘保存。
5. 执行 agent 编写 root 专用 `/srv/lab-hub/ops/backup.sh`，使用 `set -euo pipefail`、`umask 077` 和 `flock`，禁止重入；任何 snapshot/verify/upload 失败都返回非零。JSON 日志不含密码或数据库正文。备份成功前不清理本地源快照。
6. 编写 `labhub-backup.service`（oneshot）和 `labhub-backup.timer`，`OnCalendar=*-*-* 00,06,12,18:00:00 UTC`、`Persistent=true`；安装前运行 `systemd-analyze verify` 和 `systemd-analyze calendar` 验证。当前文档不代表已经创建定时任务。
7. 每 6 小时一次；保留近 2 日的全部恢复点、7 个日备份、4 个周备份、3 个月备份。每次备份使用相同的专用标签 `labhub-production`，独立 restic 仓库只放该站点的正式备份。时间戳目录会导致路径不同，保留策略必须显式按 `host,tags` 分组，而不能沿用默认按路径分组。先执行 `restic forget --tag labhub-production --group-by host,tags --keep-within 2d --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --dry-run` 核对，正式启用保留清理需要纳入用户认可的运维范围；不擅自删除初始原始导出包。
8. 用实际返回的 restic snapshot ID 在 `/srv/lab-hub/restore-drills/NEW_ID` 恢复。先核对恢复包 manifest，再用匹配版本、恢复目录和独立端口启动验证实例；不能把演练卷挂到 production data。测试库邮件同步须使用测试邮箱，不能自动触发真实邮箱联网。
9. 验证数据库完整性、管理员登录、权限、附件和邮箱密文可解密；记录用时和结果。演练应包括能取得必要镜像和密钥。备份无法恢复即不算迁移验收完成。[restic 恢复](https://restic.readthedocs.io/en/stable/050_restore.html)

监控至少覆盖：HTTPS/ready 状态、连续 5xx、最近一次成功异地备份时间（超过 12 小时提示）、磁盘剩余 <20%、容器反复重启和账单异常。通知渠道由用户指定；不把每次正常备份都通知组员。

## 12. 云端升级与回退规则

每次升级采用“新镜像 + 现有持久数据”，升级前生成一致备份，并在副本上验证 schema 变更。记录镜像摘要与数据 schema 的兼容范围，前端每次完整构建，不能依赖旧 dist 是否存在。

- **首次开放前失败**：停止云 app，保留失败副本，新建数据目录恢复首次发布基线，以匹配镜像/密钥重新演练；入口保持维护状态。stb 保持退役。
- **开放后已有新数据**：先关闭写入或停止云 app，对最新云库做一致备份。若旧镜像与当前 schema 兼容，仅回退镜像，保留最新库；不兼容时先在最新副本上修复/转换，验收后再替换。不能直接恢复上线前旧库，否则会丢失新数据。
- **云主机损坏**：新建独立云实例，从异地加密仓库恢复匹配的 DB、配置和镜像，受限验收后切 DNS。不使用 stb 临时顶替。
- **需要恢复有旧 schema 的历史数据库**：必须明确潜在数据损失窗口，经过用户确认；恢复到新目录，保留故障现场，不在正在运行的 SQLite 文件上覆盖。

应用停止后处理 WAL/SHM 时，将整个旧数据目录作为一次完整归档保留，再挂载新的恢复目录；不要只换 .db 并留下旧 WAL，也不要执行 `docker compose down -v` 删除证书或数据卷。

## 13. 最终交付清单

执行 agent 应提供这些可审阅结果后，才把任务标为完成：

- [ ] 正式域名、云地区/规格、费用与续费责任清楚；备案/接入条件已落实。
- [ ] 正式镜像对应用户认可的实际代码分支和提交，功能测试及生产 guard 通过。
- [ ] 原始源快照、新发布基线、各自 manifest 和转换记录完整，记录数/权限/附件已核对。
- [ ] 原有用户可登录；新邀请码、独立密钥、邮箱同步、15 MB 上传和移动端可用。
- [ ] 30 会话测试、实际公网网络测试、重启持久化和端口边界验证完成。
- [ ] 私有异地加密备份已运行，至少一次完整恢复演练成功，恢复凭据另存。
- [ ] stb 旧网站已精确退役，且运行、备份、代理和回退均无 stb 依赖。
- [ ] 用户收到部署/升级/恢复命令、镜像和备份位置、已知限制、紧急恢复步骤。
- [ ] 未执行 Git push；真实数据及秘密未进入新提交或公开镜像。

## 14. 执行记录格式

```text
日期 / 执行者：
当前阶段 / 状态：待执行 | 进行中 | 已验证 | 阻塞
源代码 SHA / 发布代码 SHA：
源最终停写时间 / stb 退役证据：
源快照 ID / SHA256 / 表计数：
转换后发布快照 ID / SHA256 / 允许差异：
云地区 / 实例标识 / 域名 / 备案状态：
应用镜像 ID 与摘要 / 架构 / 依赖锁 SHA256：
密钥版本标识（仅标签，无密钥值）：
测试命令与退出码 / 不含敏感数据的结果文件：
负载与网络验收指标：
异地备份 ID / 最近成功时间 / 恢复耗时：
当前公网状态 / 唯一数据写入端：
遗留风险 / 阻塞所需输入 / 下一步：
```

本手册引用的价格和平台限制须在实际执行时更新。上面的验收指标是实施目标；当前交付不代表网站已完成公网安全审计、负载测试、容器部署或备份恢复演练。
