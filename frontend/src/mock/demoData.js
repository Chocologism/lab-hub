/**
 * LabOrbit 在线演示高拟真模拟数据集
 * 模拟一个正常活跃运行数月的天文与物理交叉科学课题组
 */

export const DEMO_MEMBERS = [
  {
    id: 1,
    name: '李华 (导师)',
    real_name: '李华',
    email: 'lihua@lab.edu',
    role: 'admin',
    identity: 'teacher',
    bio: '研究方向：宇宙学大尺度结构、引力透镜与巡天数据挖掘。',
    can_manage_seminars: true,
    is_tutorial_completed: false,
    created_at: '2026-01-10T08:00:00Z'
  },
  {
    id: 2,
    name: '陈晨 (博士生 / 体验官)',
    real_name: '陈晨',
    email: 'chenchen@lab.edu',
    role: 'member',
    identity: 'student',
    bio: '三年级博士生，主攻弱引力透镜宇宙学参数限制与大模型在光谱反演中的应用。',
    can_manage_seminars: true,
    is_tutorial_completed: false,
    created_at: '2026-03-01T09:00:00Z'
  },
  {
    id: 3,
    name: '王思齐 (博士后)',
    real_name: '王思齐',
    email: 'wangsiqi@lab.edu',
    role: 'member',
    identity: 'postdoc',
    bio: '空间望远镜系外行星凌星与大气透射光谱分析。',
    can_manage_seminars: true,
    is_tutorial_completed: true,
    created_at: '2026-02-15T10:00:00Z'
  },
  {
    id: 4,
    name: '赵子涵 (硕士生)',
    real_name: '赵子涵',
    email: 'zhaozihan@lab.edu',
    role: 'member',
    identity: 'student',
    bio: '研二在读，专注星系团暗物质质量轮廓数值模拟。',
    can_manage_seminars: false,
    is_tutorial_completed: true,
    created_at: '2026-05-20T14:30:00Z'
  }
]

export const DEMO_SITE_CONFIG = {
  initialized: true,
  lab_name: '天体物理与交叉科学课题组',
  lab_short_name: 'LabOrbit',
  invite_code_enabled: true,
  public_feed_enabled: true,
  version: '2.5.0-demo'
}

// 动态计算当前周与未来周的日期，确保任何时候打开 Demo 日期都是最新合理的
function formatOffsetDate(daysOffset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const DEMO_SEMINARS = [
  {
    id: 101,
    date: formatOffsetDate(2),
    time: '14:30',
    location: '科研实验楼 5-516 会议室 / 腾讯会议：982-334-112',
    presenter_id: 2,
    presenter_name: '陈晨 (博士生 / 体验官)',
    topic: '弱引力透镜高阶统计量与暗能量状态方程限制',
    abstract: '本报告总结我们基于最新宽视场巡天测光红移样本，利用峰值计数与虚动量功率谱提取非高斯宇宙学信息的研究进展，并讨论哈勃常数与 S8 张力的观测证据。',
    slides_url: 'https://example.com/slides/demo_weak_lensing.pdf',
    status: 'upcoming',
    created_at: '2026-09-01T10:00:00Z',
    presentations: [
      {
        id: 201,
        seminar_id: 101,
        position: 0,
        presenter_id: 2,
        presenter_name: '陈晨 (博士生 / 体验官)',
        arxiv_id: '2403.08852',
        slides_url: ''
      },
      {
        id: 202,
        seminar_id: 101,
        position: 1,
        presenter_id: 4,
        presenter_name: '赵子涵 (硕士生)',
        arxiv_id: '2405.12984',
        slides_url: ''
      }
    ]
  },
  {
    id: 102,
    date: formatOffsetDate(9),
    time: '10:00',
    location: '理科楼 208 报告厅',
    presenter_id: 3,
    presenter_name: '王思齐 (博士后)',
    topic: '詹姆斯·韦伯空间望远镜对系外超级地球大气的透射光谱最新探测',
    abstract: '介绍 JWST Cycle 2 针对中温红矮星周围宜居区行星大气的透射光谱反演结果，探讨水分子特征及气溶胶光化学反应模型。',
    slides_url: '',
    status: 'upcoming',
    created_at: '2026-09-05T12:00:00Z',
    presentations: [
      {
        id: 203,
        seminar_id: 102,
        position: 0,
        presenter_id: 3,
        presenter_name: '王思齐 (博士后)',
        arxiv_id: '2312.04512',
        slides_url: ''
      }
    ]
  },
  {
    id: 100,
    date: formatOffsetDate(-5),
    time: '14:30',
    location: '科研实验楼 5-516 会议室',
    presenter_id: 1,
    presenter_name: '李华 (导师)',
    topic: '空间巡天大科学装置科学目标与课题组年度攻关任务研讨',
    abstract: '对新一年度巡天数据处理流水线及星系形态自动分类网络进行顶层设计，梳理各子课题当前进展与论文投稿节点。',
    slides_url: 'https://example.com/slides/group_annual_plan.pdf',
    status: 'completed',
    created_at: '2026-08-20T09:00:00Z',
    presentations: []
  },
  {
    id: 99,
    date: formatOffsetDate(-12),
    time: '15:00',
    location: '线上腾讯会议',
    presenter_id: 4,
    presenter_name: '赵子涵 (硕士生)',
    topic: '星系流体动力学模拟中超大质量黑洞重子反馈效应分析',
    abstract: '文献精读汇报：深入评测 IllustrisTNG 与 SIMBA 模拟套件中关于黑洞动量驱动喷流对冷气体晕的熄灭机制。',
    slides_url: 'https://example.com/slides/bh_feedback.pdf',
    status: 'completed',
    created_at: '2026-08-10T14:00:00Z',
    presentations: []
  }
]

export const DEMO_ARXIV_PAPERS = [
  {
    id: 301,
    arxiv_id: '2403.08852',
    title: 'Precision Cosmology with Stage-IV Weak Lensing Surveys: Mitigating Baryonic Feedback and Intrinsic Alignments',
    authors: 'Chen Chen, Hua Li, Alex Smith, Elena Rostova',
    journal: 'ApJ / arXiv:2403.08852',
    primary_category: 'astro-ph.CO',
    published_date: formatOffsetDate(-3),
    source_url: 'https://arxiv.org/abs/2403.08852',
    pdf_url: 'https://arxiv.org/pdf/2403.08852.pdf',
    abstract: 'Next-generation Stage-IV cosmic shear surveys offer unprecedented sensitivity to dark energy and neutrino mass constraints, but their statistical power is limited by systematic uncertainties from baryonic physics and intrinsic alignments. We present an end-to-end simulation-based inference framework using symbolic regression and neural density estimators to marginalize over baryonic scenarios while retaining cosmological constraints at sub-percent precision.',
    recommended_by: '陈晨 (博士生 / 体验官)',
    recommended_at: formatOffsetDate(-2),
    notes: '精读重点：第 4 节关于重子反馈主成分分析的参数化公式非常值得我们在下一步的数据管线中借鉴。',
    likes_count: 7,
    user_liked: true,
    read: true,
    comments: [
      {
        id: 501,
        paper_id: 301,
        user_id: 1,
        user_name: '李华 (导师)',
        user_nickname: '李教授',
        content: '方法论非常扎实，周五组会上请陈晨就公式(12)的退化方向重点展开讨论一下。',
        created_at: formatOffsetDate(-2) + ' 16:20:00'
      },
      {
        id: 502,
        paper_id: 301,
        user_id: 3,
        user_name: '王思齐 (博士后)',
        user_nickname: '思齐',
        content: '他们的开源代码已经挂在 GitHub，我跑了一下小样本，速度比传统 MCMC 快近 40 倍。',
        created_at: formatOffsetDate(-1) + ' 09:45:00'
      }
    ]
  },
  {
    id: 302,
    arxiv_id: '2405.12984',
    title: 'Foundation Models for Astronomical Spectroscopic Surveys: Self-Supervised Learning on 10 Million Stellar Spectra',
    authors: 'David Miller, Sophia Zhang, Hua Li, Marcus Vance',
    journal: 'MNRAS / arXiv:2405.12984',
    primary_category: 'astro-ph.GA',
    published_date: formatOffsetDate(-6),
    source_url: 'https://arxiv.org/abs/2405.12984',
    pdf_url: 'https://arxiv.org/pdf/2405.12984.pdf',
    abstract: 'We introduce AstroFM, a 1.2-billion-parameter masked autoencoder pre-trained on optical and infrared spectra from large-scale ground-based surveys. The model demonstrates robust zero-shot generalization across chemical abundance estimation, stellar parameter estimation, and anomaly detection for rare objects such as white dwarf-main sequence binaries and carbon stars.',
    recommended_by: '李华 (导师)',
    recommended_at: formatOffsetDate(-5),
    notes: 'AI for Science 顶尖力作，建议做光谱分类的同学必读。',
    likes_count: 12,
    user_liked: false,
    read: false,
    comments: [
      {
        id: 503,
        paper_id: 302,
        user_id: 2,
        user_name: '陈晨 (博士生 / 体验官)',
        user_nickname: '陈晨',
        content: '模型权重大约 4.8GB，已经在我们组的 A100 计算节点上部署好测试镜像，大家可以在 JupyterHub 里直接调用。',
        created_at: formatOffsetDate(-4) + ' 11:30:00'
      }
    ]
  },
  {
    id: 303,
    arxiv_id: '2312.04512',
    title: 'Atmospheric Characterization of Habitable-Zone Sub-Neptunes with the James Webb Space Telescope',
    authors: 'Sarah Jenkins, Wang Siqi, et al.',
    journal: 'Nature Astronomy / arXiv:2312.04512',
    primary_category: 'astro-ph.EP',
    published_date: formatOffsetDate(-10),
    source_url: 'https://arxiv.org/abs/2312.04512',
    pdf_url: 'https://arxiv.org/pdf/2312.04512.pdf',
    abstract: 'Atmospheric transmission spectroscopy with JWST NIRISS and NIRSpec provides unprecedented constraints on carbon-to-oxygen ratios and atmospheric metallicity of temperate exoplanets. We present detections of methane and carbon dioxide with the absence of ammonia, supporting a rich water-world ocean scenario under a hydrogen-rich atmosphere.',
    recommended_by: '王思齐 (博士后)',
    recommended_at: formatOffsetDate(-8),
    notes: '系外行星大气方向的重要成果，讨论了光化学烟雾的屏蔽机制。',
    likes_count: 5,
    user_liked: true,
    read: true,
    comments: []
  },
  {
    id: 304,
    arxiv_id: '2401.10992',
    title: 'Resolving the Hubble Tension with Early Dark Energy: Latest High-Resolution ACT and SPT Constraints',
    authors: 'Cosmology Working Group, et al.',
    journal: 'PRL / arXiv:2401.10992',
    primary_category: 'astro-ph.CO',
    published_date: formatOffsetDate(-15),
    source_url: 'https://arxiv.org/abs/2401.10992',
    pdf_url: 'https://arxiv.org/pdf/2401.10992.pdf',
    abstract: 'We examine cosmological parameter constraints when combining cosmic microwave background lensing, baryon acoustic oscillations, and high-multipole polarization spectra. Early dark energy remains a viable scenario to ease the Hubble tension, though residual tension with cosmic shear data persists.',
    recommended_by: '赵子涵 (硕士生)',
    recommended_at: formatOffsetDate(-12),
    notes: '非常全面的数据组合对比分析。',
    likes_count: 3,
    user_liked: false,
    read: false,
    comments: []
  }
]

export const DEMO_NOTICES = [
  {
    id: 401,
    title: '【学术讲座】关于举办系外行星大气前沿学术报告的通知',
    content: '各位老师、同学：\n课题组将于本周五下午 14:30 举行学术交流活动，特别邀请了国家天文台李研究员线上线下同步分享最新 JWST 光谱反演进展。欢迎全体组员准时参加并在会前阅读随附文献。',
    category: 'academic',
    importance: 'high',
    start_date: formatOffsetDate(-2),
    end_date: formatOffsetDate(5),
    created_by_name: '李华 (导师)',
    created_at: formatOffsetDate(-2) + ' 09:00:00',
    attachments: [
      {
        id: 'att-1',
        filename: '学术报告邀请函.pdf',
        url: 'https://example.com/notice_poster.pdf',
        size: 1024 * 340
      }
    ]
  },
  {
    id: 402,
    title: '【重要提醒】国家自然科学基金与研究生创新基金结题/申报节点',
    content: '请各位参与重点研发计划与青年项目的博士后、博士生，务必于本月底前将中期研究报告初稿发送至课题组公共邮箱进行交叉评审与格式合规复核。',
    category: 'general',
    importance: 'normal',
    start_date: formatOffsetDate(-5),
    end_date: formatOffsetDate(10),
    created_by_name: '李华 (导师)',
    created_at: formatOffsetDate(-5) + ' 15:00:00',
    attachments: []
  },
  {
    id: 403,
    title: '【实验室安全】高性能 GPU 计算集群例行维护与数据冷备份通知',
    content: '为保障后续大规模 N-body 宇宙学模拟任务稳定运行，校级超算中心与实验室 GPU 计算节点将于本周日凌晨 02:00-06:00 进行固件升级与网络割接。期间请提前暂存排队中的训练进程。',
    category: 'security',
    importance: 'normal',
    start_date: formatOffsetDate(-1),
    end_date: formatOffsetDate(3),
    created_by_name: '陈晨 (博士生 / 体验官)',
    created_at: formatOffsetDate(-1) + ' 17:30:00',
    attachments: []
  }
]

export const DEMO_RESOURCES_CATEGORIES = [
  {
    id: 1,
    name: '基础理论与经典专著',
    description: '课题组研究生必备基础文献、天体物理与宇宙学经典教材。',
    books: [
      {
        id: 11,
        title: 'Galaxy Dynamics (Second Edition)',
        author: 'James Binney & Scott Tremaine',
        category_id: 1,
        rating: 5,
        notes: '星系动力学领域的“圣经”，重点精读第 3、4、6 节关于引力势理论与轨道共振。',
        file_url: '',
        link_url: 'https://press.princeton.edu/books/hardcover/9780691130279/galactic-dynamics'
      },
      {
        id: 12,
        title: 'Modern Cosmology (Second Edition)',
        author: 'Scott Dodelson & Fabian Schmidt',
        category_id: 1,
        rating: 5,
        notes: '宇宙学微扰论与玻尔兹曼方程求解必备经典，推导清晰详尽。',
        file_url: '',
        link_url: 'https://www.sciencedirect.com/book/9780128159484/modern-cosmology'
      }
    ]
  },
  {
    id: 2,
    name: '计算集群、工具链与软件指南',
    description: '实验室计算节点、Slurm 调度脚本、JupyterHub 及天文数据格式处理工具。',
    books: [
      {
        id: 21,
        title: 'Astropy: A Community Python Package for Astronomy',
        author: 'Astropy Collaboration',
        category_id: 2,
        rating: 5,
        notes: '坐标转换、FITS 读写、宇宙学距离计算的核心库规范。',
        file_url: '',
        link_url: 'https://www.astropy.org'
      },
      {
        id: 22,
        title: '课题组 GPU 集群 Slurm 作业提交规范与常用脚本库',
        author: '陈晨',
        category_id: 2,
        rating: 5,
        notes: '涵盖 PyTorch DDP 多机多卡环境加载、虚拟环境隔离及日志持久化。',
        file_url: '',
        link_url: ''
      }
    ]
  }
]

export const DEMO_PENDING_IMPORTS = [
  {
    id: 601,
    raw_text: '学术报告通知\n主讲人：张明 博士（国家天文台）\n题目：基于机器学习的引力透镜时延宇宙学测量\n时间：2026年10月15日 14:00\n地点：5-516 会议室',
    inferred_type: 'talk',
    parsed_data: {
      title: '基于机器学习的引力透镜时延宇宙学测量',
      speaker: '张明 博士',
      date: formatOffsetDate(14),
      time: '14:00',
      location: '科研楼 5-516 会议室',
      notes: '邀请校外学者来访交流'
    },
    image_urls: [],
    file_attachments: [],
    status: 'pending',
    created_by_id: 2,
    created_by_name: '陈晨 (博士生 / 体验官)',
    created_at: formatOffsetDate(-1) + ' 10:00:00'
  }
]

export const DEMO_TALKS = [
  {
    id: 701,
    title: '系外行星系统形成与早期轨道迁移演化',
    speaker: '王思齐 博士后',
    date: formatOffsetDate(4),
    time: '10:00',
    location: '天文楼 216 会议室',
    notes: '青年学者前沿交流',
    event_type: 'talk',
    poster_url: '',
    source: '智能导入 (陈晨)'
  },
  {
    id: 702,
    title: '2026 空间天体物理与大样本巡天学术研讨会',
    speaker: '',
    date: formatOffsetDate(18),
    end_date: formatOffsetDate(21),
    time: '全天',
    city: '南京',
    location: '国际会议大酒店',
    organizer: '中国天文学会 / 空间天文专业委员会',
    event_type: 'conference',
    sub_type: '学术研讨会',
    abstract_deadline: formatOffsetDate(10),
    registration_deadline: formatOffsetDate(15),
    notes: '重点关注下一代空间望远镜科学数据处理',
    source: '会议通知'
  }
]
