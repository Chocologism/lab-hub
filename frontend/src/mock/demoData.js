/**
 * LabOrbit 在线演示高拟真模拟数据集
 * 模拟一个正常活跃运行数月的天文与物理交叉科学课题组
 */

export const DEMO_MEMBERS = [
  {
    id: 1,
    name: '李华 (导师 / 管理员)',
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
    name: '陈晨 (博士生 / 普通成员)',
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
    presenter_name: '陈晨 (博士生 / 普通成员)',
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
        presenter_name: '陈晨 (博士生 / 普通成员)',
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
      },
      {
        id: 204,
        seminar_id: 102,
        position: 1,
        presenter_id: 1,
        presenter_name: '李华 (导师 / 管理员)',
        arxiv_id: '2401.10992',
        slides_url: ''
      }
    ]
  },
  {
    id: 103,
    date: formatOffsetDate(16),
    time: '14:30',
    location: '科研实验楼 5-516 会议室',
    presenter_id: 1,
    presenter_name: '李华 (导师 / 管理员)',
    topic: '下一代空间巡天大科学装置科学目标与课题组关键攻关任务研讨',
    abstract: '对新一年度巡天数据处理流水线及弱引力透镜高阶统计量提取进行顶层设计，梳理各子课题当前进展与论文投稿节点。',
    slides_url: 'https://example.com/slides/group_annual_plan.pdf',
    status: 'upcoming',
    created_at: '2026-09-10T09:00:00Z',
    presentations: [
      {
        id: 205,
        seminar_id: 103,
        position: 0,
        presenter_id: 1,
        presenter_name: '李华 (导师 / 管理员)',
        arxiv_id: '2405.12984',
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
    presenter_name: '李华 (导师 / 管理员)',
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
    recommender: {
      id: 2,
      name: '陈晨 (博士生 / 普通成员)',
      real_name: '陈晨',
      identity: 'student',
      role: 'member'
    },
    recommended_by: '陈晨 (博士生 / 普通成员)',
    recommended_at: formatOffsetDate(-2),
    notes: '精读重点：第 4 节关于重子反馈主成分分析的参数化公式非常值得我们在下一步的数据管线中借鉴。',
    likes_count: 7,
    user_liked: true,
    is_liked_by_me: true,
    read: true,
    is_read_by_me: true,
    comments: [
      {
        id: 501,
        paper_id: 301,
        user_id: 1,
        user_name: '李华 (导师 / 管理员)',
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
    recommender: {
      id: 1,
      name: '李华 (导师 / 管理员)',
      real_name: '李华',
      identity: 'teacher',
      role: 'admin'
    },
    recommended_by: '李华 (导师 / 管理员)',
    recommended_at: formatOffsetDate(-5),
    notes: 'AI for Science 顶尖力作，建议做光谱分类的同学必读。',
    likes_count: 12,
    user_liked: false,
    is_liked_by_me: false,
    read: false,
    is_read_by_me: false,
    comments: [
      {
        id: 503,
        paper_id: 302,
        user_id: 2,
        user_name: '陈晨 (博士生 / 普通成员)',
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
    recommender: {
      id: 3,
      name: '王思齐 (博士后)',
      real_name: '王思齐',
      identity: 'postdoc',
      role: 'member'
    },
    recommended_by: '王思齐 (博士后)',
    recommended_at: formatOffsetDate(-8),
    notes: '系外行星大气方向的重要成果，讨论了光化学烟雾的屏蔽机制。',
    likes_count: 5,
    user_liked: true,
    is_liked_by_me: true,
    read: true,
    is_read_by_me: true,
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
    recommender: {
      id: 4,
      name: '赵子涵 (硕士生)',
      real_name: '赵子涵',
      identity: 'student',
      role: 'member'
    },
    recommended_by: '赵子涵 (硕士生)',
    recommended_at: formatOffsetDate(-12),
    notes: '非常全面的数据组合对比分析。',
    likes_count: 3,
    user_liked: false,
    is_liked_by_me: false,
    read: false,
    is_read_by_me: false,
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
  { id: 1, name: '教材', is_default: true },
  { id: 2, name: '工具', is_default: true },
  { id: 3, name: '网站', is_default: true }
]

export const DEMO_BOOKS = [
  {
    id: 1,
    title: 'Galaxy Dynamics (Second Edition)',
    authors: 'James Binney & Scott Tremaine',
    category: '教材',
    description: '星系天文学与天体动力学公认的基石经典，深入推导引力势理论、维里定理、无碰撞玻尔兹曼方程与棒旋共振结构。',
    cover_url: 'https://images.unsplash.com/photo-1532012164546-f432f2e3777a?auto=format&fit=crop&w=400&q=80',
    url: 'https://press.princeton.edu/books/hardcover/9780691130279/galactic-dynamics',
    tutorial_url: 'https://press.princeton.edu/books/hardcover/9780691130279/galactic-dynamics',
    exercise_url: '',
    github_url: 'https://github.com/jobovy/galpy',
    favorite_count: 18,
    is_favorited: true,
    created_at: '2026-02-10T08:00:00Z'
  },
  {
    id: 2,
    title: 'Modern Cosmology (Second Edition)',
    authors: 'Scott Dodelson & Fabian Schmidt',
    category: '教材',
    description: '现代宇宙学核心教材，系统阐述宇宙膨胀、热大爆炸核合成、微波背景辐射各向异性及大尺度结构演化线性微扰论。',
    cover_url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=400&q=80',
    url: 'https://www.sciencedirect.com/book/9780128159484/modern-cosmology',
    tutorial_url: 'https://www.sciencedirect.com/book/9780128159484/modern-cosmology',
    exercise_url: '',
    github_url: 'https://github.com/cmbant/CAMB',
    favorite_count: 24,
    is_favorited: true,
    created_at: '2026-02-15T09:00:00Z'
  },
  {
    id: 3,
    title: 'Gravitational Lensing: Strong, Weak and Micro',
    authors: 'Peter Schneider, Chris Kochanek, Joachim Wambsganss',
    category: '教材',
    description: '瑞士萨斯费天文高级课程经典讲义，详述强透镜爱因斯坦环、弱透镜宇宙剪切及微引力透镜搜寻系外行星的前沿理论。',
    cover_url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=400&q=80',
    url: 'https://link.springer.com/book/10.1007/978-3-540-30310-7',
    tutorial_url: 'https://link.springer.com/book/10.1007/978-3-540-30310-7',
    exercise_url: '',
    github_url: 'https://github.com/lenstronomy/lenstronomy',
    favorite_count: 12,
    is_favorited: false,
    created_at: '2026-03-01T10:00:00Z'
  },
  {
    id: 4,
    title: 'Astropy: The Astronomy Python Ecosystem',
    authors: 'The Astropy Collaboration',
    category: '工具',
    description: '天体物理通用 Python 基础生态，封装天球坐标转换、WCS 投影变换、FITS 文件 I/O 与宇宙学距离计算高精度模块。',
    cover_url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=400&q=80',
    url: 'https://www.astropy.org',
    tutorial_url: 'https://docs.astropy.org',
    exercise_url: '',
    github_url: 'https://github.com/astropy/astropy',
    favorite_count: 32,
    is_favorited: true,
    created_at: '2026-01-20T11:00:00Z'
  },
  {
    id: 5,
    title: '课题组 GPU 超算集群 Slurm 作业调度指南',
    authors: '天体计算实验平台运维组',
    category: '工具',
    description: '涵盖 A100/H800 多卡环境调度脚本模板、PyTorch DDP 分布式通信配置、容器镜像加载及大显存任务内存调优避坑指南。',
    cover_url: '',
    url: '',
    tutorial_url: '',
    exercise_url: '',
    github_url: '',
    favorite_count: 19,
    is_favorited: false,
    created_at: '2026-03-10T14:00:00Z'
  },
  {
    id: 6,
    title: 'NASA Astrophysics Data System (ADS)',
    authors: 'Harvard-Smithsonian Center for Astrophysics',
    category: '网站',
    description: '全球天体物理学核心文献检索引证网络平台，收录全量 arXiv 预印本、同行评审期刊及引文知识图谱。',
    cover_url: '',
    url: 'https://ui.adsabs.harvard.edu',
    tutorial_url: '',
    exercise_url: '',
    github_url: '',
    favorite_count: 45,
    is_favorited: true,
    created_at: '2026-01-05T08:00:00Z'
  },
  {
    id: 7,
    title: 'arXiv.org e-Print Archive (Astrophysics)',
    authors: 'Cornell University',
    category: '网站',
    description: '国际高能物理与天文学最重要的开放获取预印本文库，每日北京时间早 9 点准时同步全球最新科研手稿。',
    cover_url: '',
    url: 'https://arxiv.org/archive/astro-ph',
    tutorial_url: '',
    exercise_url: '',
    github_url: '',
    favorite_count: 50,
    is_favorited: true,
    created_at: '2026-01-01T08:00:00Z'
  }
]

export const DEMO_LIBRARY_PAPERS = [
  {
    id: 1,
    arxiv_id: '2403.08852',
    title: 'Precision Cosmology with Stage-IV Weak Lensing Surveys: Mitigating Baryonic Feedback and Intrinsic Alignments',
    authors: ['Chen Chen', 'Hua Li', 'Alex Smith', 'Elena Rostova'],
    journal: 'ApJ 962:45 (2026) / arXiv:2403.08852',
    primary_category: 'astro-ph.CO',
    published_date: formatOffsetDate(-3),
    source_url: 'https://arxiv.org/abs/2403.08852',
    pdf_url: 'https://arxiv.org/pdf/2403.08852.pdf',
    abstract: 'Next-generation Stage-IV cosmic shear surveys offer unprecedented sensitivity to dark energy and neutrino mass constraints, but their statistical power is limited by systematic uncertainties from baryonic physics and intrinsic alignments.',
    from_recommendation: true,
    from_seminar: true,
    seminar_id: 101,
    metadata_status: 'ready',
    created_at: formatOffsetDate(-3)
  },
  {
    id: 2,
    arxiv_id: '2405.12984',
    title: 'Foundation Models for Astronomical Spectroscopic Surveys: Self-Supervised Learning on 10 Million Stellar Spectra',
    authors: ['David Miller', 'Sophia Zhang', 'Hua Li', 'Marcus Vance'],
    journal: 'MNRAS 528:1120 (2026) / arXiv:2405.12984',
    primary_category: 'astro-ph.GA',
    published_date: formatOffsetDate(-6),
    source_url: 'https://arxiv.org/abs/2405.12984',
    pdf_url: 'https://arxiv.org/pdf/2405.12984.pdf',
    abstract: 'We introduce AstroFM, a 1.2-billion-parameter masked autoencoder pre-trained on optical and infrared spectra from large-scale ground-based surveys.',
    from_recommendation: true,
    from_seminar: false,
    seminar_id: null,
    metadata_status: 'ready',
    created_at: formatOffsetDate(-6)
  },
  {
    id: 3,
    arxiv_id: '2312.04512',
    title: 'Atmospheric Characterization of Habitable-Zone Sub-Neptunes with the James Webb Space Telescope',
    authors: ['Sarah Jenkins', 'Wang Siqi', 'et al.'],
    journal: 'Nature Astronomy 8:210 (2026) / arXiv:2312.04512',
    primary_category: 'astro-ph.EP',
    published_date: formatOffsetDate(-10),
    source_url: 'https://arxiv.org/abs/2312.04512',
    pdf_url: 'https://arxiv.org/pdf/2312.04512.pdf',
    abstract: 'Atmospheric transmission spectroscopy with JWST NIRISS and NIRSpec provides unprecedented constraints on carbon-to-oxygen ratios and atmospheric metallicity of temperate exoplanets.',
    from_recommendation: false,
    from_seminar: true,
    seminar_id: 102,
    metadata_status: 'ready',
    created_at: formatOffsetDate(-10)
  },
  {
    id: 4,
    arxiv_id: '2401.10992',
    title: 'Resolving the Hubble Tension with Early Dark Energy: Latest High-Resolution ACT and SPT Constraints',
    authors: ['Cosmology Working Group', 'et al.'],
    journal: 'PRL 132:041301 (2026) / arXiv:2401.10992',
    primary_category: 'astro-ph.CO',
    published_date: formatOffsetDate(-15),
    source_url: 'https://arxiv.org/abs/2401.10992',
    pdf_url: 'https://arxiv.org/pdf/2401.10992.pdf',
    abstract: 'We examine cosmological parameter constraints when combining cosmic microwave background lensing, baryon acoustic oscillations, and high-multipole polarization spectra.',
    from_recommendation: true,
    from_seminar: false,
    seminar_id: null,
    metadata_status: 'ready',
    created_at: formatOffsetDate(-15)
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

export const DEMO_EMAILS = [
  {
    id: 801,
    msg_uid: 'uid-801',
    subject: '【学术讲座】空间引力波探测与星系形成演化前沿研讨',
    from_addr: '国家天文台学术委员会 <academic@nao.cas.cn>',
    from_name: '国家天文台学术委员会',
    to_addr: 'astro_lab@cstnet.cn',
    date_str: formatOffsetDate(-1) + ' 09:30:00',
    created_at: formatOffsetDate(-1) + ' 09:30:00',
    body_text: '各位老师同学：兹定于本周五举行关于空间引力波探测的线上线下联合报告会。主讲人：张维民 研究员（中国科学院国家空间科学中心）。时间：' + formatOffsetDate(3) + ' 14:30。地点：天文大厦三楼报告厅 / 腾讯会议：882-910-334。',
    body_html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 680px;">
      <h2 style="color: #0f172a; border-bottom: 2px solid #38bdf8; padding-bottom: 10px; margin-top: 0;">空间引力波探测与高红移星系演化前沿研讨会通知</h2>
      <p><strong>主讲人：</strong>张维民 研究员（中国科学院国家空间科学中心）</p>
      <p><strong>时间：</strong>${formatOffsetDate(3)} 14:30 - 16:30</p>
      <p><strong>地点：</strong>天文大厦三楼报告厅 / 腾讯会议：882-910-334</p>
      <p><strong>报告摘要：</strong>随着太极计划与天琴计划的稳步推进，空间低频引力波天文学即将迎来黄金观测时代。本报告将系统阐述极端质量比旋进（EMRI）与双超大质量黑洞并合事件的引力波形建模，并探讨如何通过联合巡天探测限制早期宇宙暗物质晕的质量增长历程。</p>
      <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px 16px; margin: 18px 0; border-radius: 6px;">
        <p style="margin: 0; font-size: 13px; color: #166534;">※ 会前建议预读有关空间干涉仪臂长波动抑制与时间延迟干涉（TDI）的相关预印本文献，欢迎全体师生积极参会交流。</p>
      </div>
    </div>`,
    has_attachments: true,
    attachments: [
      {
        id: 'att-email-1',
        filename: '学术报告邀请函与海报.pdf',
        url: 'https://example.com/poster.pdf',
        size: 1024 * 480
      }
    ],
    is_read: true
  },
  {
    id: 802,
    msg_uid: 'uid-802',
    subject: '中国天文学会 2026 年学术年会第一轮通知及征文启事',
    from_addr: '中国天文学会秘书处 <cas@pmo.ac.cn>',
    from_name: '中国天文学会秘书处',
    to_addr: 'astro_lab@cstnet.cn',
    date_str: formatOffsetDate(-2) + ' 14:15:00',
    created_at: formatOffsetDate(-2) + ' 14:15:00',
    body_text: '各位会员、天文学界同仁：中国天文学会 2026 年学术年会拟定于 10 月中旬召开。本届年会涵盖星系宇宙学、恒星与行星系统、大科学装置等多个专题分会场，现启动征文与大会口头报告申请。',
    body_html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b;">
      <h2 style="color: #0f172a; border-bottom: 2px solid #818cf8; padding-bottom: 8px;">中国天文学会 2026 年学术年会第一轮通知</h2>
      <p>各位会员、天文学界同仁：</p>
      <p>中国天文学会 2026 年学术年会拟定于今年 10 月中旬在南京举行。现就有关事项通知如下：</p>
      <ul>
        <li><strong>会议时间：</strong>${formatOffsetDate(25)} 至 ${formatOffsetDate(29)}</li>
        <li><strong>摘要提交截止日期：</strong>${formatOffsetDate(12)}</li>
        <li><strong>主要专题：</strong>星系形成与演化、引力透镜宇宙学、空间天文观测技术、AI for Science 天文智能计算</li>
      </ul>
      <p>请拟参会人员在截止日期前通过会议官网完成注册及摘要提交。</p>
    </div>`,
    has_attachments: false,
    attachments: [],
    is_read: true
  },
  {
    id: 803,
    msg_uid: 'uid-803',
    subject: '【基金委提醒】2026 年度国家自然科学基金重点项目进展报告提交提醒',
    from_addr: '国家自然科学基金委员会 <report@nsfc.gov.cn>',
    from_name: '国家自然科学基金委员会',
    to_addr: 'lihua@lab.edu',
    date_str: formatOffsetDate(-3) + ' 11:00:00',
    created_at: formatOffsetDate(-3) + ' 11:00:00',
    body_text: '尊敬的李华教授：您负责的重点项目（项目批准号：12233005）年度进展报告现已开放填报，请登录科学基金网络信息系统在线填写并于规定时间前提交依托单位审核。',
    body_html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b;">
      <h3 style="color: #0f172a;">国家自然科学基金委员会 业务提醒函</h3>
      <p>尊敬的 <strong>李华</strong> 教授：</p>
      <p>您主持的重点项目《宽视场巡天中弱引力透镜多维系统误差建模与宇宙学限制》（项目批准号：12233005）2026 年度进展报告填报通道已正式开放。</p>
      <p>请组织项目组成员系统梳理本年度代表性成果、论文发表及经费执行情况，通过科学基金网络信息系统在线完成填报。</p>
      <p style="color: #64748b; font-size: 13px;">（系统自动发送邮件，请勿直接回复）</p>
    </div>`,
    has_attachments: false,
    attachments: [],
    is_read: true
  },
  {
    id: 804,
    msg_uid: 'uid-804',
    subject: 'The Astrophysical Journal: Decision on Manuscript #ApJ-108291',
    from_addr: 'The Astrophysical Journal <apj@aas.org>',
    from_name: 'ApJ Editorial Office',
    to_addr: 'lihua@lab.edu',
    date_str: formatOffsetDate(-4) + ' 16:45:00',
    created_at: formatOffsetDate(-4) + ' 16:45:00',
    body_text: 'Dear Prof. Li, We have received the referee report for your manuscript "Precision Cosmology with Stage-IV Weak Lensing Surveys". The referee recommends minor revision...',
    body_html: `<div style="font-family: Georgia, serif; line-height: 1.7; color: #1e293b;">
      <h3 style="font-family: sans-serif; color: #0f172a;">The Astrophysical Journal - Editorial Decision</h3>
      <p>Dear Prof. Hua Li,</p>
      <p>We are pleased to inform you that the review of your manuscript <strong>"Precision Cosmology with Stage-IV Weak Lensing Surveys: Mitigating Baryonic Feedback and Intrinsic Alignments"</strong> (MS #ApJ-108291) is now complete.</p>
      <p>The referee finds your symbolic regression framework for baryonic feedback parameterization to be sound and impactful. The recommendation is <strong>Minor Revision</strong>.</p>
      <p>Please refer to the referee comments attached and submit your revised manuscript within 30 days.</p>
      <p>Sincerely,<br/><em>The Editors, The Astrophysical Journal</em></p>
    </div>`,
    has_attachments: true,
    attachments: [
      {
        id: 'att-email-2',
        filename: 'Referee_Report_ApJ-108291.pdf',
        url: 'https://example.com/referee_report.pdf',
        size: 1024 * 145
      }
    ],
    is_read: false
  }
]

export const DEMO_FEEDBACK_ITEMS = [
  {
    id: 1,
    title: '建议在组会日历导出中增加提醒提前量设置',
    content: '目前的 .ics 日历文件导入手机或 Mac 默认是准点提醒。希望能在导出时支持选择提前 15 分钟或提前 1 天提醒，这样更方便提前准备汇报和课件。',
    author: '陈晨 (博士生 / 普通成员)',
    author_id: 2,
    page: '/seminars',
    resolved: true,
    created_at: formatOffsetDate(-3) + 'T10:15:00',
    replies: [
      {
        id: 101,
        author: '李华 (导师 / 管理员)',
        content: '非常实用的建议！已经在排期管理模块中更新了日历提醒规则，现在下载的 .ics 会自动携带提前 30 分钟和提前 1 天的双重响铃提醒。',
        created_at: formatOffsetDate(-2) + 'T16:40:00',
        read_at: formatOffsetDate(-1) + 'T09:00:00'
      }
    ]
  },
  {
    id: 2,
    title: '文献推荐卡片能否增加批量复制 BibTeX 引用的功能？',
    content: '在文献推荐流里看到好文章时经常想直接贴进 Overleaf 里引用，如果卡片上有个一键复制 BibTeX 的小按钮会极大提升写作效率。',
    author: '赵子涵 (硕士生)',
    author_id: 4,
    page: '/arxiv',
    resolved: false,
    created_at: formatOffsetDate(-1) + 'T14:20:00',
    replies: [
      {
        id: 102,
        author: '李华 (导师 / 管理员)',
        content: '收到，这个功能很棒，已记录在下一步系统迭代需求清单中，近期版本会支持直接解析 arXiv API 生成标准 BibTeX 格式。',
        created_at: formatOffsetDate(0) + 'T09:30:00',
        read_at: null
      }
    ]
  }
]

