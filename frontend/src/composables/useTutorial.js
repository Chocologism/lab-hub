import { ref, computed } from 'vue'
import { authApi } from '../api/client'

const showTutorial = ref(false)
const currentStepIndex = ref(0)
const currentSubStepIndex = ref(0)
const isMandatory = ref(false)
const userRole = ref('student')

const GENERAL_STEPS = [
  {
    id: 'home',
    title: '工作台主页',
    subtitle: '组内学术动态看板与近期排期速览',
    description: '课题组日常科研协作的数字大本营。集中展示本周学术报告、主讲人安排与全站重要通告。',
    icon: 'layout',
    tag: '基础核心',
    targetRoute: '/',
    targetNavName: '工作台',
    actionPrompt: '当前位于课题组工作台看板主页',
    keyHighlights: [
      '每日科研学术微光打卡与签到氛围',
      '本周最新学术报告速览与主讲人提醒',
      '顶部置顶学术通告跑马灯循环广播'
    ],
    subSteps: [
      {
        id: 'home_pin_sidebar',
        targetId: 'tour-pin-sidebar',
        targetSelector: '#tour-pin-sidebar, .sour-pin-container',
        targetRoute: '/',
        placement: 'right',
        requiresClick: true,
        title: '第一步：固定主导航侧边栏',
        subtitle: '锁定工作台侧边栏',
        description: '建议先点击左侧图钉图标固定导航侧边栏，防止鼠标移开时自动收起，便于随时切换科研模块。',
        purposeNote: '固定主导航，保持工作台各功能入口常驻。',
        actionPrompt: '点击左侧图钉按钮固定侧边栏'
      },
      {
        id: 'home_actions',
        targetId: 'tour-home-actions',
        targetSelector: '#tour-home-actions, .forecast-intro',
        targetRoute: '/',
        placement: 'bottom',
        requiresClick: false,
        title: '快捷推荐文献',
        subtitle: '一键发起学术分享',
        description: '在此可一键直达本周学术日程，或点击【推荐一篇文献】快速向全组分享最新研读的高价值论文。',
        purposeNote: '向全组快速推荐文献与查看排期。',
        actionPrompt: '需要向组内推荐最新研读的文献时，可在此快速发起'
      },
      {
        id: 'home_marquee',
        targetId: 'tour-home-marquee',
        targetSelector: '#tour-home-marquee, .forecast-topline',
        targetRoute: '/',
        placement: 'bottom',
        requiresClick: false,
        title: '全站通知跑马灯',
        subtitle: '置顶学术通告循环广播',
        description: '置顶循环滚动课题组重要通告、学术讲座与截稿提醒，确保关键信息不遗漏。',
        purposeNote: '全组重要学术通知与截稿提醒集散中心。',
        actionPrompt: '查阅课题组通告、截稿提醒或重要讲座时关注此处'
      },
      {
        id: 'home_week',
        targetId: 'tour-home-week',
        targetSelector: '#tour-home-week, .home-week',
        targetRoute: '/',
        placement: 'top',
        requiresClick: false,
        title: '每周科研日程',
        subtitle: '按周聚合学术活动',
        description: '按周呈现组内学术日程安排，支持按住日程左右滑动切换周次，点击具体日期可查看当天活动详情。',
        purposeNote: '按周了解学术排期，支持左右拖动翻周。',
        actionPrompt: '支持鼠标左右拖动切换周次，快速查看每周学术安排'
      },
      {
        id: 'home_next_meeting',
        targetId: 'tour-home-next-meeting',
        targetSelector: '#tour-home-next-meeting, .next-meeting',
        targetRoute: '/',
        placement: 'left',
        requiresClick: false,
        title: '最近一次组会动态',
        subtitle: '下一次组会倒计时',
        description: '动态显示距离当前最近的一次组会时间、主讲人及地点。点击卡片可展开详情抽屉，预习议程与课件。',
        purposeNote: '查看即将举行的组会与预习文献。',
        actionPrompt: '点击卡片查看最新组会议程、预习文献与课件'
      }
    ]
  },
  {
    id: 'schedule',
    title: '学术日程与组会',
    subtitle: '组会轮值排期、周日程与学术会议',
    description: '全面查看全学期组会轮值排期、周历视图与国际学术会议，汇报人可在线填报题目与摘要。',
    icon: 'calendar',
    tag: '学术日程',
    targetRoute: '/seminars',
    targetNavName: '学术日程',
    actionPrompt: '点击导航栏【学术日程】前往排期看板',
    keyHighlights: [
      '全学期组会排期日历与主讲人轮值表',
      '轮值汇报人可在线提交/更新报告题目与摘要',
      '支持粘贴通知文本或海报附图，多模态 AI 智能提取报告/会议/通知',
      '支持暂存到协同待处理队列，供管理成员审核后一键正式发布',
      '一键导出 .ics 日历订阅文件同步到手机日历'
    ],
    subSteps: [
      {
        id: 'schedule_nav',
        targetId: 'tour-nav-seminars',
        targetSelector: '#tour-nav-seminars, a[href="/seminars"]',
        targetRoute: '/',
        placement: 'right',
        requiresClick: true,
        isNavStep: true,
        title: '进入【学术日程】',
        subtitle: '点击侧边栏日历图标',
        description: '点击左侧导航栏中的日历图标，进入课题组学术日程与组会排期看板。',
        purposeNote: '切换至学术日程模块。',
        actionPrompt: '点击左侧【学术日程】图标前往页面'
      },
      {
        id: 'schedule_timeline_tab',
        targetId: 'tab-timeline',
        targetSelector: '#tab-timeline',
        targetRoute: '/seminars',
        placement: 'bottom',
        requiresClick: false,
        title: '组会时间线视图',
        subtitle: '全景时间线',
        description: '【组会时间线】为默认全景视图，完整展示全学期排期轨道、各次组会时间与轮值汇报人。',
        purposeNote: '宏观总览全学期排期安排与汇报节奏。',
        actionPrompt: '可通过时间线直观掌握学期汇报节奏'
      },
      {
        id: 'schedule_card',
        targetId: 'tour-seminars-card',
        targetSelector: '#tour-seminars-card, .schedule-overview-item, .seminar-card, .day-lane',
        targetRoute: '/seminars?tab=timeline',
        placement: 'bottom',
        requiresClick: false,
        title: '组会详情与在线填报',
        subtitle: '议程查看与摘要提交',
        description: '点击任意一场组会卡片展开详情抽屉。轮值主讲人可在线填报报告题目与摘要，全组成员可下载课件与文献。',
        purposeNote: '查看详细议程并支持主讲人在线申报。',
        actionPrompt: '点击卡片可查看详情；轮值主讲人可在线填报摘要'
      },
      {
        id: 'schedule_smart_paste',
        targetId: 'tour-smart-paste-btn',
        targetSelector: '#tour-smart-paste-btn, .smart-paste-btn',
        targetRoute: '/seminars?tab=timeline',
        placement: 'bottom',
        requiresClick: false,
        title: '文本与海报智能导入',
        subtitle: '多模态 AI 智能提取与协同审核',
        description: '无论收到微信通知、邮件正文还是会议海报图片，直接粘贴即可通过多模态 AI 智能提取报告/会议/通知字段。还可暂存到【待处理导入】协同队列，由他人或管理员审核发布。',
        purposeNote: '极速录入学术日程，免去繁琐的人工敲字录入。',
        actionPrompt: '点击【文本智能导入】即可体验粘贴文本或拖入海报一键解析'
      },
      {
        id: 'schedule_week_tab',
        targetId: 'tab-week',
        targetSelector: '#tab-week',
        targetRoute: '/seminars?tab=timeline',
        placement: 'bottom',
        requiresClick: true,
        title: '点击切换【周日程】',
        subtitle: '按周排期视图',
        description: '请点击上方【周日程】标签，切换至以周为维度的日程视图，直观查看每周各天的活动分布。',
        purposeNote: '按周跟踪与管理组会安排。',
        actionPrompt: '点击上方【周日程】标签切换视图'
      },
      {
        id: 'schedule_week_grid',
        targetId: 'tour-week-grid',
        targetSelector: '#tour-week-grid, .week-grid, .week-slider-wrapper',
        targetRoute: '/seminars?tab=week',
        placement: 'top',
        requiresClick: false,
        title: '7天日程与滑动手势',
        subtitle: '左右拖拽或双指横滑无缝翻周',
        description: '直观展示 7 天日程安排、今日标记与法定节假日。支持在日程区域按住鼠标左右拖拽或双指横滑切换周次。',
        purposeNote: '微观掌握每周各天的活动分布，支持手势拖拽翻周。',
        actionPrompt: '可在日程区域按住鼠标左右拖拽换周，或点击日期查看当天活动'
      },
      {
        id: 'schedule_week_export',
        targetId: 'tour-week-export',
        targetSelector: '#tour-week-export, .export-week-btn',
        targetRoute: '/seminars?tab=week',
        placement: 'bottom',
        requiresClick: false,
        title: '一键同步手机日历',
        subtitle: '跨设备日历订阅',
        description: '点击【导出到日历】生成标准 .ics 文件，直接导入至 macOS / iOS 手机日历、Outlook 或 Google Calendar。',
        purposeNote: '将组会与学术报告一键同步至手机，防止遗忘。',
        actionPrompt: '需要将日程同步至手机时，点击【导出到日历】即可生成文件'
      },
      {
        id: 'schedule_conferences_tab',
        targetId: 'tab-conferences',
        targetSelector: '#tab-conferences',
        targetRoute: '/seminars?tab=week',
        placement: 'bottom',
        requiresClick: true,
        title: '点击切换【学术会议】',
        subtitle: '国际会议与截稿追踪',
        description: '请点击上方【学术会议】标签，进入国际学术会议看板，集中追踪学术前沿会议排期与截稿日期。',
        purposeNote: '跟踪重要国际学术会议与投稿截稿时间。',
        actionPrompt: '点击上方【学术会议】标签切换视图'
      },
      {
        id: 'schedule_conf_toolbar',
        targetId: 'tour-conf-toolbar',
        targetSelector: '#tour-conf-toolbar, .conference-toolbar',
        targetRoute: '/seminars?tab=conferences',
        placement: 'bottom',
        requiresClick: false,
        title: '多维筛选与关注',
        subtitle: '年份切换与关注会议过滤',
        description: '支持按进行中/历史状态、年份筛选及关键词即时搜索。勾选【只看我关注的】快速定位重点意向会议。',
        purposeNote: '快速筛选意向会议，掌握全组关注热点。',
        actionPrompt: '可通过顶部工具栏切换年份、检索会议或勾选只看关注'
      },
      {
        id: 'schedule_conf_card',
        targetId: 'tour-conf-card',
        targetSelector: '#tour-conf-card, .conference-card:first-child, .conference-month-group',
        targetRoute: '/seminars?tab=conferences',
        placement: 'top',
        requiresClick: false,
        title: '截稿倒计时与征稿详情',
        subtitle: '早鸟注册与投稿截止提醒',
        description: '会议卡片清晰提示早鸟注册与投稿截止倒计时。点击卡片可展开详情抽屉查看征稿主题、举办城市与官方网站链接。',
        purposeNote: '查看会议征文主题、截止日期与官方投稿链接。',
        actionPrompt: '点击会议卡片查看详细征稿主题与官网，避免错过投稿截止日'
      }
    ]
  },
  {
    id: 'arxiv',
    title: '文献推荐与研讨',
    subtitle: '前沿预印本文献流、一键推荐与深入研讨',
    description: '追踪学术前沿。每日自动聚合预印本文献流，支持一键推荐到全组、大模型学术翻译与多轮深度讨论。',
    icon: 'book-open',
    tag: '文献研讨',
    targetRoute: '/arxiv',
    targetNavName: '文献推荐',
    actionPrompt: '点击导航栏【文献推荐】前往前沿文献中心',
    keyHighlights: [
      '每日自动聚合最新前沿预印本论文流',
      '高价值论文一键推荐至全组或定点同窗',
      '文献研讨区围绕论文创新点深度讨论与星标收藏'
    ],
    subSteps: [
      {
        id: 'arxiv_nav',
        targetId: 'tour-nav-arxiv',
        targetSelector: '#tour-nav-arxiv, a[href="/arxiv"]',
        targetRoute: '/seminars',
        placement: 'right',
        requiresClick: true,
        isNavStep: true,
        title: '进入【文献推荐】',
        subtitle: '点击侧边栏文献图标',
        description: '点击左侧导航栏中的文献图标，前往 arXiv 前沿预印本文献流与学术研讨中心。',
        purposeNote: '切换至文献推荐与研讨模块。',
        actionPrompt: '点击左侧【文献推荐】图标前往页面'
      },
      {
        id: 'arxiv_recommend_panel',
        targetId: 'tour-arxiv-recommend-panel',
        targetSelector: '#tour-arxiv-recommend-panel, .recommend-panel',
        targetRoute: '/arxiv',
        placement: 'bottom',
        requiresClick: false,
        title: '快速归档与定向分享',
        subtitle: '文献元数据自动提取',
        description: '粘贴 arXiv 编号或 DOI 链接，系统将自动解析标题、作者与摘要（支持通过 Semantic Scholar 智能补全全文摘要）；输入心得后可公开推荐或定向推送给合作同窗。',
        purposeNote: '全组前沿文献归档与研读分享。',
        actionPrompt: '粘贴文献编号或链接即可自动解析元数据并分享'
      },
      {
        id: 'arxiv_toolbar',
        targetId: 'tour-arxiv-toolbar',
        targetSelector: '#tour-arxiv-toolbar, .feed-toolbar',
        targetRoute: '/arxiv',
        placement: 'bottom',
        requiresClick: false,
        title: '多维度文献筛选',
        subtitle: '公开推荐与定向推送过滤',
        description: '在此可切换查看全组公开推荐或他人定向推送的文献，并支持按研究领域与组会关联标签进行精确筛选。',
        purposeNote: '按推荐范围与学科标签过滤文献流。',
        actionPrompt: '可按公开推荐、定向推送及学科领域快速筛选'
      },
      {
        id: 'arxiv_card',
        targetId: 'tour-arxiv-first-paper',
        targetSelector: '#tour-arxiv-first-paper, .paper-row, .paper-list',
        targetRoute: '/arxiv',
        placement: 'top',
        requiresClick: false,
        title: '文献精读与 AI 研讨',
        subtitle: 'PDF阅读、中文翻译与学术交流',
        description: '每篇文献均提供原文 PDF 直达链接；点击【翻译】可获取中文摘要；点击【与AI讨论】可基于全文展开公式推导与答疑。',
        purposeNote: '沉浸式论文精读与多人学术交流。',
        actionPrompt: '点击翻译获取中文摘要，或点击与 AI 讨论展开深入交流'
      }
    ]
  },
  {
    id: 'resources',
    title: '教材资料与知识文库',
    subtitle: '专业教材专著、代码仓库与科研工具矩阵',
    description: '沉淀实验室公共学术资产。收录核心专著讲义、GitHub 配套代码与计算服务器连接指南。',
    icon: 'folder',
    tag: '知识资产',
    targetRoute: '/resources',
    targetNavName: '教材资料',
    actionPrompt: '点击导航栏【教材资料】查阅公共文库',
    keyHighlights: [
      '实验室经典专业教材讲义与 GitHub 配套代码',
      '常用在线科研工具快捷跳转矩阵',
      '高性能计算集群与服务器 SSH 安全连接配置指南'
    ],
    subSteps: [
      {
        id: 'resources_nav',
        targetId: 'tour-nav-resources',
        targetSelector: '#tour-nav-resources, a[href="/resources"]',
        targetRoute: '/arxiv',
        placement: 'right',
        requiresClick: true,
        isNavStep: true,
        title: '进入【教材资料】',
        subtitle: '点击侧边栏资料库图标',
        description: '点击左侧导航栏中的资料库图标，查阅课题组经典专业专著、电子讲义与开源代码。',
        purposeNote: '切换至教材资料与公共知识资产模块。',
        actionPrompt: '点击左侧【教材资料】图标前往页面'
      },
      {
        id: 'resources_category_bar',
        targetId: 'tour-resources-category-bar',
        targetSelector: '#tour-resources-category-bar, .category-bar',
        targetRoute: '/resources',
        placement: 'bottom',
        requiresClick: false,
        title: '资料分类与检索',
        subtitle: '按研究方向分类聚合',
        description: '教材与资料按研究方向分类沉淀；支持拼音首字母排序与关键词即时搜索，快速定位所需参考书。',
        purposeNote: '体系化公共资料分类与多维检索工具。',
        actionPrompt: '按研究方向分类筛选，支持拼音与关键词快速检索'
      },
      {
        id: 'resources_card',
        targetId: 'tour-resources-book-grid',
        targetSelector: '#tour-resources-book-grid, .book-grid, .book-card',
        targetRoute: '/resources',
        placement: 'top',
        requiresClick: false,
        title: '专著翻阅与代码库',
        subtitle: '电子书、配套代码与星标收藏',
        description: '每本专著均收录在线讲义与 GitHub 配套代码仓库。点击星标可直接收录至个人收藏专库，便于随时查阅。',
        purposeNote: '在线翻阅专著课件与克隆配套源码。',
        actionPrompt: '可在线翻阅专著课件，或点击链接直达配套代码仓库'
      }
    ]
  },
  {
    id: 'mailbox',
    title: '学术邮箱与海报解析',
    subtitle: '机构学术邮件同步与讲座海报 AI 识别入历',
    description: '安全集成学术邮箱，自动归集讲座通知；内置多模态视觉模型支持海报长图 OCR 解析并一键写入日程。',
    icon: 'mail',
    tag: '邮箱中转',
    targetRoute: '/mailbox',
    targetNavName: '邮箱',
    actionPrompt: '点击导航栏【邮箱】体验邮件同步与海报识别',
    keyHighlights: [
      '绑定个人学术邮箱，集中接收研讨通知与审稿邮件',
      '多模态视觉大模型对海报长图 OCR 智能提取',
      '一键将邮件中的报告时间地点直接提取写入日程'
    ],
    subSteps: [
      {
        id: 'mailbox_nav',
        targetId: 'tour-nav-mailbox',
        targetSelector: '#tour-nav-mailbox, a[href="/mailbox"]',
        targetRoute: '/resources',
        placement: 'right',
        requiresClick: true,
        isNavStep: true,
        title: '进入【学术邮箱】',
        subtitle: '点击侧边栏邮箱图标',
        description: '点击左侧导航栏中的邮箱图标，体验学术邮件接收与讲座海报识别录入。',
        purposeNote: '切换至学术邮箱模块。',
        actionPrompt: '点击左侧【学术邮箱】图标前往页面'
      },
      {
        id: 'mailbox_main',
        targetId: 'tour-mailbox-main',
        targetSelector: '#tour-mailbox-main, .mailbox-welcome, .mailbox-search-bar, .emails-container',
        targetRoute: '/mailbox',
        placement: 'bottom',
        requiresClick: false,
        title: '机构邮箱绑定与同步',
        subtitle: 'IMAP/POP3 协议安全中转',
        description: '支持中科院科技网及各类高校机构邮箱协议，邮件在本地安全中转，集中收取学术研讨会与讲座通知。',
        purposeNote: '统一归集机构学术信件，安全保密。',
        actionPrompt: '在此绑定机构学术邮箱，集中接收组会与研讨通知'
      },
      {
        id: 'mailbox_features',
        targetId: 'tour-mailbox-features',
        targetSelector: '#tour-mailbox-features, .email-card, .welcome-desc, .mailbox-welcome',
        targetRoute: '/mailbox',
        placement: 'top',
        requiresClick: false,
        title: '海报识别与智能入历',
        subtitle: '多模态 AI 提取日程',
        description: '收到讲座长图海报时，多模态 AI 能够自动 OCR 提取报告题目、时间、地点与主讲人，点击【推送到日程】即可一键排期。',
        purposeNote: '自动提取海报信息并一键写入组会日历。',
        actionPrompt: '收到讲座海报时，点击推送到日程即可一键录入'
      }
    ]
  },
  {
    id: 'assistant',
    title: 'AI 科研助手与个人中心',
    subtitle: '学术大模型答疑、公式推导与偏好定制',
    description: '适配课题组学术方向的大模型助理，支持专业理论答疑、LaTeX 实时推导与个性化界面风格定制。',
    icon: 'sparkles',
    tag: 'AI 智囊',
    targetRoute: '/assistant',
    targetNavName: '科研助手',
    actionPrompt: '点击导航栏进入【科研助手】体验学术问答',
    keyHighlights: [
      '适配课题组方向的科研大模型全天候智囊',
      '精通专业理论公式推导、学术翻译与代码编写',
      '支持在个人中心自由定制多款高颜值视觉主题皮肤'
    ],
    subSteps: [
      {
        id: 'assistant_nav',
        targetId: 'tour-nav-assistant',
        targetSelector: '#tour-nav-assistant, a[href="/assistant"]',
        targetRoute: '/mailbox',
        placement: 'right',
        requiresClick: true,
        isNavStep: true,
        title: '进入【AI 助手】',
        subtitle: '点击侧边栏机器人图标',
        description: '点击左侧导航栏中的机器人图标，体验课题组学术大模型科研智囊。',
        purposeNote: '切换至 AI 科研助手模块。',
        actionPrompt: '点击左侧【AI 助手】图标前往页面'
      },
      {
        id: 'assistant_workspace',
        targetId: 'tour-assistant-workspace',
        targetSelector: '#tour-assistant-workspace, .chat-input-area, .assistant-main',
        targetRoute: '/assistant',
        placement: 'top',
        requiresClick: false,
        title: '公式推导与学术问答',
        subtitle: '全天候专业科研智囊',
        description: '精通专业理论推导，支持实时渲染复杂的 LaTeX 数学公式与物理方程，并支持学术翻译与代码调试。',
        purposeNote: '开展文献精读、公式推演与学术咨询。',
        actionPrompt: '遇到公式推导疑问或学术翻译时在此提问交流'
      },
      {
        id: 'account_nav',
        targetId: 'tour-nav-account',
        targetSelector: '#tour-nav-account, a[href="/account"], .account-btn-duck',
        targetRoute: '/assistant',
        placement: 'right',
        requiresClick: true,
        isNavStep: true,
        title: '进入【个人中心】',
        subtitle: '点击底部用户头像',
        description: '点击左侧导航栏底部的用户头像，进入个人中心，定制你的专属工作台外观与偏好。',
        purposeNote: '切换至个人中心与偏好设置。',
        actionPrompt: '点击左下角用户头像进入个人中心'
      },
      {
        id: 'account_appearance',
        targetId: 'tour-appearance-settings',
        targetSelector: '#tour-appearance-settings, .theme-settings-section',
        targetRoute: '/account',
        placement: 'top',
        requiresClick: false,
        title: '视觉主题与导览重温',
        subtitle: '界面配色与导览快捷入口',
        description: '在此可自由切换界面主题配色风格；若后续需要重新体验新手引导，可在页面下方的快捷卡片中随时重新唤起。',
        purposeNote: '个性化界面配色与重温新手引导。',
        actionPrompt: '可更换界面主题配色，或在需要时重温新手导览'
      }
    ]
  },
]

const ADMIN_STEPS = [
  {
    id: 'admin_branding',
    title: '课题组品牌与系统配置',
    subtitle: '全站名称、标识缩写与 AI 提示词全局定制',
    description: '管理员可随时修改课题组中文全称、英文缩写标识、标语与默认组会地点，并可定制 AI 助手的系统提示词。',
    icon: 'settings',
    tag: '管理员专享',
    isAdmin: true,
    targetRoute: '/account',
    highlightId: 'tour-system-branding',
    targetNavName: '课题组品牌配置',
    actionPrompt: '在个人中心查看【课题组品牌与系统配置】',
    keyHighlights: [
      '全站中英文全称、英文标识缩写与 Slogan 动态定制',
      '设定组会默认研讨地点（如研讨室或会议号）',
      '自定义全站 AI 科研助手的 System Prompt 系统提示词'
    ],
    subSteps: [
      {
        id: 'admin_branding_step',
        targetId: 'tour-system-branding',
        targetSelector: '#tour-system-branding',
        targetRoute: '/account',
        placement: 'top',
        requiresClick: false,
        title: '课题组品牌与系统定制',
        subtitle: '全站名称与提示词配置',
        description: '在此可修改课题组名称、英文缩写标识、默认组会地点以及全站 AI 助手的学科预设提示词。',
        purposeNote: '课题组专属品牌与全局系统参数配置。',
        actionPrompt: '课题组名称变更或调整 AI 提示词时在此配置'
      }
    ]
  },
  {
    id: 'admin_members',
    title: '成员治理与权限指派',
    subtitle: '成员在线监控与细粒度角色授权',
    description: '实时掌握成员在线活跃状态与最近访问时间；支持任命协管员或授予“组会排期管理”特权。',
    icon: 'users',
    tag: '管理员专享',
    isAdmin: true,
    targetRoute: '/account',
    highlightId: 'tour-member-management',
    targetNavName: '成员权限治理',
    actionPrompt: '在个人中心查看【成员权限管理】列表',
    keyHighlights: [
      '实时监控组员在线活跃度与注册身份（学生/导师）',
      '一键提升组员为管理员协同维护日常事务',
      '细粒度授权特定成员“组会排期管理”权限'
    ],
    subSteps: [
      {
        id: 'admin_members_step',
        targetId: 'tour-member-management',
        targetSelector: '#tour-member-management',
        targetRoute: '/account',
        placement: 'top',
        requiresClick: false,
        title: '成员在线监控与授权',
        subtitle: '成员状态与权限指派',
        description: '实时查看课题组成员的在线状态；支持任命组员为管理员或分派“组会排期管理”权限。',
        purposeNote: '课题组成员管理与日常事务分工授权。',
        actionPrompt: '指派协同管理员或查看成员活跃状态时在此管理'
      }
    ]
  },
  {
    id: 'admin_invites',
    title: '注册邀请码体系',
    subtitle: '组内私有化隔离与邀请码分发',
    description: '平台实行严格的私有化隔离保护。管理员可按需生成面向不同身份的专属邀请码，并可随时注销停用。',
    icon: 'key',
    tag: '管理员专享',
    isAdmin: true,
    targetRoute: '/account',
    highlightId: 'tour-invite-codes',
    targetNavName: '注册邀请码管理',
    actionPrompt: '在个人中心查看【注册邀请码管理】面板',
    keyHighlights: [
      '按需生成面向不同身份的专属注册邀请码',
      '随时查看邀请码使用记录并一键停用注销',
      '组内私有化隔离防护，杜绝外部非授权人员注册'
    ],
    subSteps: [
      {
        id: 'admin_invites_step',
        targetId: 'tour-invite-codes',
        targetSelector: '#tour-invite-codes',
        targetRoute: '/account',
        placement: 'top',
        requiresClick: false,
        title: '专属邀请码生成与分发',
        subtitle: '严格把控入组权限',
        description: '按需生成面向学生或教师的专属注册邀请码，随时查看使用记录并一键停用，保护组内讨论私密性。',
        purposeNote: '组内私密防护，防止未授权外部注册。',
        actionPrompt: '有新成员加入时在此生成并分发专属邀请码'
      }
    ]
  },
  {
    id: 'admin_notices',
    title: '全站置顶通知发布',
    subtitle: '首页跑马灯广播与带附件通知管理',
    description: '向全组传达关键学术通告、重要截稿提醒。支持置顶首页跑马灯、设置有效期限及上传 PDF 文件附件。',
    icon: 'bell',
    tag: '管理员专享',
    isAdmin: true,
    targetRoute: '/notices',
    targetNavName: '全站置顶通知',
    actionPrompt: '点击导航栏【重要通知】前往发布页面',
    keyHighlights: [
      '发布全站重要通知，支持置顶首页跑马灯循环广播',
      '上传带 PDF 文件的通知附件，支持自动提取正文文本',
      '设置通知有效期，过期自动归档保持界面整洁'
    ],
    subSteps: [
      {
        id: 'admin_notices_nav',
        targetId: 'tour-nav-notices',
        targetSelector: '#tour-nav-notices, a[href="/notices"]',
        targetRoute: '/account',
        placement: 'right',
        requiresClick: true,
        isNavStep: true,
        title: '进入【重要通知】',
        subtitle: '全站通告发布中心',
        description: '点击左侧导航栏中的通知图标，体验全站通告发布与跑马灯广播管理。',
        purposeNote: '切换至全站通知管理模块。',
        actionPrompt: '点击左侧【重要通知】图标前往发布页面'
      }
    ]
  },
  {
    id: 'admin_moderation',
    title: '组会全局排期与治理',
    subtitle: '排期批量顺延、统一会议号与学术资产维护',
    description: '拥有最高学术内容治理权限。遇到节假日或日程冲突可一键批量顺延排期，并可统一绑定腾讯会议号。',
    icon: 'shield',
    tag: '管理员专享',
    isAdmin: true,
    targetRoute: '/seminars',
    targetNavName: '组会全局治理',
    actionPrompt: '在【学术日程】体验管理员专属的排期治理工具集',
    keyHighlights: [
      '节假日或突发学术冲突时，支持一键批量顺延排期',
      '支持主讲人汇报顺序快速调换与日程锁定',
      '拥有最高学术排期治理与资料维护特权'
    ],
    subSteps: [
      {
        id: 'admin_moderation_step',
        targetId: 'tour-seminars-header-actions',
        targetSelector: '#tour-seminars-header-actions, .header-actions',
        targetRoute: '/seminars',
        placement: 'bottom',
        requiresClick: false,
        title: '管理员特权：排期治理与统一设置',
        subtitle: '全局排期调度与会议治理',
        description: '管理员专属排期治理工具集：支持一键批量顺延排期、统一会议号、录入学术会议与导出日历文件。',
        purposeNote: '全站学术排期最高治理操作。',
        actionPrompt: '遇到节假日调课或突发学术冲突时在此批量调整'
      }
    ]
  },
]

export function useTutorial() {
  const steps = computed(() => {
    if (userRole.value === 'admin') {
      return [...GENERAL_STEPS, ...ADMIN_STEPS]
    }
    return GENERAL_STEPS
  })

  const currentStep = computed(() => {
    const s = steps.value
    return s[currentStepIndex.value] || s[0]
  })

  const currentSubStepList = computed(() => {
    return currentStep.value?.subSteps || []
  })

  const currentSubStep = computed(() => {
    const list = currentSubStepList.value
    if (!list.length) return null
    return list[currentSubStepIndex.value] || list[0]
  })

  const isFirstStep = computed(() => currentStepIndex.value === 0 && currentSubStepIndex.value === 0)
  
  const isLastStep = computed(() => {
    const isLastModule = currentStepIndex.value >= steps.value.length - 1
    const isLastSub = currentSubStepIndex.value >= currentSubStepList.value.length - 1
    return isLastModule && isLastSub
  })

  // 所有子步骤扁平列表与进度百分比
  const flatSteps = computed(() => {
    const result = []
    steps.value.forEach((st, sIdx) => {
      const subs = st.subSteps || []
      if (!subs.length) {
        result.push({
          ...st,
          stepIndex: sIdx,
          subIndex: 0,
          parentStep: st
        })
      } else {
        subs.forEach((sub, subIdx) => {
          result.push({
            ...sub,
            stepIndex: sIdx,
            subIndex: subIdx,
            parentStep: st
          })
        })
      }
    })
    return result
  })

  const totalFlatSteps = computed(() => flatSteps.value.length)

  const currentFlatStepIndex = computed(() => {
    let count = 0
    for (let i = 0; i < currentStepIndex.value; i++) {
      count += (steps.value[i]?.subSteps?.length || 1)
    }
    count += currentSubStepIndex.value
    return count
  })

  const progressPercent = computed(() => {
    if (!steps.value.length) return 0
    return Math.round(((currentStepIndex.value + 1) / steps.value.length) * 100)
  })

  const flatProgressPercent = computed(() => {
    if (!totalFlatSteps.value) return 0
    return Math.min(100, Math.round(((currentFlatStepIndex.value + 1) / totalFlatSteps.value) * 100))
  })

  function openTutorial(options = {}) {
    userRole.value = options.role || 'student'
    isMandatory.value = !!options.mandatory
    currentStepIndex.value = 0
    currentSubStepIndex.value = 0
    showTutorial.value = true
  }

  function nextStep() {
    if (currentStepIndex.value < steps.value.length - 1) {
      currentStepIndex.value++
      currentSubStepIndex.value = 0
    }
  }

  function prevStep() {
    if (currentStepIndex.value > 0) {
      currentStepIndex.value--
      currentSubStepIndex.value = 0
    }
  }

  function jumpToStep(idx) {
    if (idx >= 0 && idx < steps.value.length) {
      currentStepIndex.value = idx
      currentSubStepIndex.value = 0
    }
  }

  function nextSubStep() {
    const list = currentSubStepList.value
    if (currentSubStepIndex.value < list.length - 1) {
      currentSubStepIndex.value++
    } else if (currentStepIndex.value < steps.value.length - 1) {
      currentStepIndex.value++
      currentSubStepIndex.value = 0
    } else {
      finishTutorial()
    }
  }

  function prevSubStep() {
    if (currentSubStepIndex.value > 0) {
      currentSubStepIndex.value--
    } else if (currentStepIndex.value > 0) {
      currentStepIndex.value--
      const prevList = steps.value[currentStepIndex.value]?.subSteps || []
      currentSubStepIndex.value = Math.max(0, prevList.length - 1)
    }
  }

  function jumpToSubStep(stepIdx, subIdx) {
    if (stepIdx >= 0 && stepIdx < steps.value.length) {
      currentStepIndex.value = stepIdx
      const maxSub = (steps.value[stepIdx]?.subSteps?.length || 1) - 1
      currentSubStepIndex.value = Math.max(0, Math.min(subIdx, maxSub))
    }
  }

  async function finishTutorial() {
    try {
      await authApi.completeTutorial()
    } catch (err) {
      console.warn('同步完成教程状态至服务器失败 (离线或无网络):', err)
    }

    // 本地持久化更新
    const storedUserRaw = localStorage.getItem('labhub_user')
    if (storedUserRaw) {
      try {
        const u = JSON.parse(storedUserRaw)
        u.tutorial_completed = true
        localStorage.setItem('labhub_user', JSON.stringify(u))
      } catch {}
    }

    showTutorial.value = false
  }

  function skipTutorial() {
    finishTutorial()
  }

  return {
    showTutorial,
    currentStepIndex,
    currentSubStepIndex,
    currentStep,
    currentSubStep,
    currentSubStepList,
    flatSteps,
    totalFlatSteps,
    currentFlatStepIndex,
    flatProgressPercent,
    steps,
    isMandatory,
    isFirstStep,
    isLastStep,
    progressPercent,
    openTutorial,
    nextStep,
    prevStep,
    jumpToStep,
    nextSubStep,
    prevSubStep,
    jumpToSubStep,
    finishTutorial,
    skipTutorial,
  }
}
