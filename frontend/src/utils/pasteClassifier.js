/**
 * 文本粘贴智能识别与分类工具库
 * 支持学术报告 (talk)、学术会议 (conference)、公文通知 (notice) 的类型自动研判与双轨（规则/AI）提取
 */

import { extractSingleTalkFields, parseConferenceMetadataLocally, applyInstitutionLocationPrefix, pickChinesePartIfDual } from './talkEmail'
import { extractScheduleFromEmailWithAi, extractConferenceFromEmailWithAi, extractSingleNoticeWithAi, normalizeNoticeDates } from '../services/aiService'
import { extractTextFromPdfUrl } from './pdfNotice'
import { shanghaiToday } from './schedule'

/**
 * 自动识别粘贴文本的类型
 * @param {string} text - 待判定的原始文本
 * @returns {'talk' | 'conference' | 'notice'}
 */
export function classifyPastedText(text = '') {
  if (!text || typeof text !== 'string') return 'talk'
  const raw = text.trim()
  if (!raw) return 'talk'

  const lower = raw.toLowerCase()

  // 1. 评分系统 (Scoring)
  let talkScore = 0
  let confScore = 0
  let noticeScore = 0

  // 报告特征词
  if (/学术报告|主讲人|报告人|主讲嘉宾|报告嘉宾|特邀嘉宾|报告题目|题目为|题为|做题为/i.test(raw)) talkScore += 5
  if (/seminar|colloquium|\btalk\b|speaker|presenter/i.test(lower)) talkScore += 4
  if (/(?:报告|讲座)(?:时间|地点|摘要)/i.test(raw)) talkScore += 4
  if (/腾讯会议|zoom|报告厅|会议室|302会议室|5-516/i.test(raw)) talkScore += 2
  if (/邀请(?:到了|到|了)?(?:[^,，。；\n\r]*?的)?\s*[A-Za-z\u4e00-\u9fa5·]{2,6}\s*(?:博士|教授|研究员|特聘研究员|副教授|院士|老师)/i.test(raw)) talkScore += 4

  // 会议特征词
  if (/学术会议|研讨会|学术论坛|全国年会|研讨班|讲习班|暑期学校|暑假学校|冬令营|大会通知|征文通知|征稿通知|第一轮通知|第二轮通知|第三轮通知|参会通知|参会邀请|邀请函/i.test(raw)) confScore += 6
  if (/conference|symposium|workshop|annual meeting|summer school|winter school|congress|call for papers/i.test(lower)) confScore += 5
  if (/征文|征稿|早鸟|截稿|摘要提交|注册费|开幕式|闭幕式|组委会|组织委员会/i.test(raw)) confScore += 4
  if (/主办单位|承办单位|协办单位|举办地点|举办城市/i.test(raw)) confScore += 3
  if (/registration|submission|deadline|early bird/i.test(lower)) confScore += 3

  // 通知特征词
  if (/关于.*的通知|关于.*的通告|重要通知|紧急通告|放假调休|校历安排|节假日放假|作息时间调整/i.test(raw)) noticeScore += 6
  if (/奖学金|国家奖学金|学业奖学金|评选通知|申报工作|学分认定|开题考核|中期考核|毕业答辩|选课通知|补退选/i.test(raw)) noticeScore += 5
  if (/停电通知|停水通知|断网通知|网络割接|电梯维保|电梯检修|清洗水箱|空调维保|消防演习|消防排查|危化品安全|实验室安全检查|安全排查/i.test(raw)) noticeScore += 6
  if (/教务处|研究生院|后勤处|保卫处|学工部|校医院|园区管委会|各院系|全体师生/i.test(raw)) noticeScore += 3
  if (/请各单位|请同学们|请各位老师|遵照执行|特此通知|特此通告/i.test(raw)) noticeScore += 4

  // 特殊强特征覆盖
  // 如果明确包含“报告人：”或“主讲人：”且不是会议征稿，报告权重极高
  if (/(?:报告人|主讲人|Speaker)\s*[:：]/i.test(raw)) {
    talkScore += 4
  }
  // 如果包含会议截稿、早鸟、会议网站等，会议权重极高
  if (/早鸟|截稿|注册截止|征文截止/i.test(raw)) {
    confScore += 4
  }
  // 如果包含放假、停水停电、奖学金，通知权重极高
  if (/放假|调休|停水|停电|国家奖学金|评选申报/i.test(raw)) {
    noticeScore += 5
  }

  // 研判结果选择最高分项
  if (noticeScore > confScore && noticeScore > talkScore) {
    return 'notice'
  }
  if (confScore > talkScore && confScore >= noticeScore) {
    return 'conference'
  }
  if (talkScore > 0) {
    return 'talk'
  }

  // 兜底检查
  if (/会议|研讨|论坛|年会/i.test(raw)) return 'conference'
  if (/通知|通告|安排/i.test(raw)) return 'notice'

  return 'talk'
}

/**
 * 本地规则提取通知字段
 * @param {string} text - 原始通知文本
 * @param {Array} attachments - 附件列表
 * @returns {Object} 结构化通知字段
 */
export function extractNoticeFieldsLocally(text = '', attachments = []) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const todayStr = shanghaiToday()

  // 1. 标题提取：首行或“关于...通知”
  let title = ''
  const aboutMatch = text.match(/关于(?:举办|召开|组织|开展)?([^\n\r]{2,50}?)(?:的通知|的通告|通知|通告)/)
  if (aboutMatch) {
    title = aboutMatch[0].replace(/^[【\[](?:通知|通告|重要通知|紧急通知)[\]】]\s*/, '').trim()
  } else if (lines.length > 0) {
    let cand = lines[0].replace(/^[【\[](?:通知|通告|重要通知|紧急通知)[\]】]\s*/, '').trim()
    if (cand.length > 40) cand = cand.slice(0, 40)
    title = cand
  }
  if (!title) title = '综合事务通知'

  // 2. 分类提取
  let category = 'general'
  if (/奖学金|学分|选课|答辩|开题|培养|成绩|教务|研究生院|注册报到/i.test(text)) {
    category = 'academic_affairs'
  } else if (/放假|调休|校历|节假日|中秋|国庆|元旦|寒假|暑假|假期/i.test(text)) {
    category = 'holiday'
  } else if (/停水|停电|断网|割接|网络维护|电梯|维保|水箱|空调|供暖|后勤|保洁|维修/i.test(text)) {
    category = 'facility'
  } else if (/安全|消防|演习|危化品|排查|极端天气|台风|暴雨|防汛|预警|保卫/i.test(text)) {
    category = 'safety'
  } else if (/印章|公文|报销|财务|合同|行政|办公/i.test(text)) {
    category = 'administrative'
  }

  // 3. 重要程度提取
  let importance = 'normal'
  if (/紧急|特急|暂停运行|立即|停水|停电|突发|火灾|预警/i.test(text)) {
    importance = 'urgent'
  } else if (/重要|国家奖学金|放假通知|申报截止|评选|考核/i.test(text)) {
    importance = 'important'
  }

  // 4. 起止日期提取
  let startDate = todayStr
  let endDate = ''

  const fullDateMatch = text.match(/(?<!\d)(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/)
  if (fullDateMatch) {
    const y = fullDateMatch[1]
    const m = fullDateMatch[2].padStart(2, '0')
    const d = fullDateMatch[3].padStart(2, '0')
    startDate = `${y}-${m}-${d}`
  }

  // 匹配截止日期（如：2026年9月30日前、截止时间9月30日、至9月30日）
  const deadlineSuffixMatch = text.match(/((?:20\d{2}[年/.-])?\d{1,2}[月/.-]\d{1,2}日?)\s*(?:前|之前|截止|结束)/i)
  const deadlinePrefixMatch = text.match(/(?:截止|结束|至|到)(?:时间|日期)?[:：\s]*((?:20\d{2}[年/.-])?\d{1,2}[月/.-]\d{1,2}日?)/i)
    || text.match(/(?:-|—|——|~|至|到)\s*((?:20\d{2}[年/.-])?\d{1,2}[月/.-]\d{1,2}日?)/i)

  const deadlineCandidate = deadlineSuffixMatch?.[1] || deadlinePrefixMatch?.[1]
  if (deadlineCandidate) {
    const cleanEnd = deadlineCandidate.match(/(?<!\d)(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/)
    if (cleanEnd) {
      endDate = `${cleanEnd[1]}-${cleanEnd[2].padStart(2, '0')}-${cleanEnd[3].padStart(2, '0')}`
    } else {
      const md = deadlineCandidate.match(/(?<!\d)(\d{1,2})[月/.-](\d{1,2})日?/)
      if (md) {
        const curY = new Date().getFullYear()
        endDate = `${curY}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`
      }
    }
  }

  const normalizedDates = normalizeNoticeDates(startDate, endDate, todayStr)

  return {
    title,
    content: text.trim(),
    category,
    importance,
    start_date: normalizedDates.start_date,
    end_date: normalizedDates.end_date,
    attachments: Array.isArray(attachments) ? attachments : []
  }
}

/**
 * 预处理并解析选定的文本、图片、文件（特别是 PDF 提取正文）
 * 允许用户与审核人员在执行解析前，精确指定哪些组件参与提取
 *
 * @param {Object} params
 * @param {string} [params.rawText=''] - 用户粘贴的原始文本
 * @param {boolean} [params.includeText=true] - 是否将原始文本纳入解析
 * @param {Array<string>} [params.selectedImageUrls=[]] - 选中的图片链接数组
 * @param {Array<Object>} [params.selectedFiles=[]] - 选中的文件数组（{ id, filename, url, size, content_type }）
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ combinedText: string, primaryPosterUrl: string, targetImages: string[], targetFiles: Object[], hasSource: boolean, pdfExtractedCount: number }>}
 */
export async function resolveContentForParsing({
  rawText = '',
  includeText = true,
  selectedImageUrls = [],
  selectedFiles = [],
  signal
} = {}) {
  const textChunks = []
  if (includeText && rawText && rawText.trim()) {
    textChunks.push(rawText.trim())
  }

  const validFiles = Array.isArray(selectedFiles) ? selectedFiles : []
  let pdfExtractedCount = 0

  for (const file of validFiles) {
    const isPdf = file?.content_type === 'application/pdf' ||
      /\.pdf$/i.test(file?.filename || '') ||
      /\.pdf$/i.test(file?.name || '') ||
      /\.pdf$/i.test(file?.url || '')
    if (isPdf && file.url) {
      try {
        const pdfText = await extractTextFromPdfUrl(file.url, { maxPages: 5, signal })
        if (pdfText && pdfText.trim()) {
          pdfExtractedCount++
          textChunks.push(`【随附文档 ${file.filename || file.name || 'PDF'} 正文】：\n${pdfText.trim()}`)
        }
      } catch (err) {
        console.warn('从 PDF 中提取文本失败，跳过正文追加:', err)
      }
    }
  }

  const validImages = Array.isArray(selectedImageUrls) ? selectedImageUrls : []
  const combinedText = textChunks.join('\n\n')
  const primaryPosterUrl = validImages.length > 0 ? validImages[0] : ''
  const hasSource = Boolean(combinedText.trim() || validImages.length > 0 || validFiles.length > 0)

  return {
    combinedText,
    primaryPosterUrl,
    targetImages: validImages,
    targetFiles: validFiles,
    hasSource,
    pdfExtractedCount
  }
}

const PLACEHOLDER_TEXT_REGEX = /^[【\[]?(?:随附海报图片|随附海报|随附图片|海报图片|仅随附海报)[】\]]?$/i

/**
 * 规则自动识别填充卡片
 * @param {string} text - 待解析文本（可包含原始文本或 PDF 抽取文本）
 * @param {'talk' | 'conference' | 'notice'} type - 目标类型
 * @param {Object} options - 附件与海报信息 { imageUrls, files }
 * @returns {Object} 填充好的卡片字段对象
 */
export function extractFieldsByRule(text = '', type = 'talk', { imageUrls = [], files = [] } = {}) {
  const posterUrl = (Array.isArray(imageUrls) && imageUrls.length > 0) ? imageUrls[0] : ''
  const validFiles = Array.isArray(files) ? files : []
  const trimmedText = (text || '').trim()
  const isPlaceholderOnly = !trimmedText || PLACEHOLDER_TEXT_REGEX.test(trimmedText)
  const hasText = !isPlaceholderOnly

  if (type === 'notice') {
    // 构造通知附件数组
    const atts = []
    if (Array.isArray(imageUrls)) {
      imageUrls.forEach((img, idx) => {
        atts.push({
          id: `img-${idx}`,
          filename: `海报图片-${idx + 1}.jpg`,
          url: img,
          content_type: 'image/jpeg'
        })
      })
    }
    validFiles.forEach((f, idx) => {
      atts.push({
        id: f.id || `file-${idx}`,
        filename: f.filename || f.name || `附件-${idx + 1}`,
        url: f.url,
        content_type: f.content_type || 'application/octet-stream',
        size: f.size || 0
      })
    })

    if (!hasText) {
      const fallbackTitle = validFiles[0]?.filename?.replace(/\.[^.]+$/, '') || (posterUrl ? '综合事务通知（附图）' : '综合事务通知')
      return {
        title: fallbackTitle,
        content: validFiles.length > 0 ? '详见随附文件' : (posterUrl ? '详见随附图片' : ''),
        category: 'general',
        importance: 'normal',
        start_date: shanghaiToday(),
        end_date: '',
        attachments: atts
      }
    }
    return extractNoticeFieldsLocally(text, atts)
  }

  if (type === 'conference') {
    if (!hasText) {
      const fallbackTitle = validFiles[0]?.filename?.replace(/\.[^.]+$/, '') || (posterUrl ? '学术会议（海报）' : '学术会议')
      return {
        title: fallbackTitle,
        sub_type: '研讨会',
        date: shanghaiToday(),
        end_date: shanghaiToday(),
        city: '',
        location: '',
        organizer: '',
        abstract_deadline: '',
        early_bird_deadline: '',
        registration_deadline: '',
        website_url: '',
        registration_url: '',
        handbook_url: '',
        notes: validFiles.length > 0 ? '详见随附会议资料' : (posterUrl ? '详见随附会议海报' : ''),
        poster_url: posterUrl || '',
        attachments: validFiles
      }
    }

    const parsedConf = parseConferenceMetadataLocally(text, '')
    let confTitle = (parsedConf.title || '').trim()
    confTitle = confTitle.replace(/^[【\[](?:会议通知|学术会议|通知|参会邀请)[\]】]\s*/i, '')
    confTitle = confTitle.replace(/^关于(?:召开|举办|组织)(.*?)(?:的通知|的邀请|的通告|通知)?$/i, '$1')
    confTitle = confTitle.replace(/(?:的通知|的通告|通知)$/i, '').trim()
    if (PLACEHOLDER_TEXT_REGEX.test(confTitle)) {
      confTitle = ''
    }
    return {
      ...parsedConf,
      title: confTitle || parsedConf.title || (posterUrl ? '学术会议（海报）' : '学术会议'),
      poster_url: posterUrl || parsedConf.poster_url || '',
      attachments: validFiles
    }
  }

  // 报告 (talk) 规则解析
  if (!hasText) {
    const fallbackTitle = validFiles[0]?.filename?.replace(/\.[^.]+$/, '') || (posterUrl ? '学术报告（海报）' : '学术报告')
    return {
      title: fallbackTitle,
      date: shanghaiToday(),
      time: '10:00',
      speaker: '',
      location: '',
      notes: validFiles.length > 0 ? '详见随附报告资料' : (posterUrl ? '详见随附海报' : ''),
      poster_url: posterUrl || '',
      attachments: validFiles
    }
  }

  const parsedTalk = extractSingleTalkFields(text, {
    date: shanghaiToday(),
    time: '10:00'
  })

  // 若默认提取仍为兜底的“学术报告”，补充匹配“学术报告：xxx”或首行题目
  if (!parsedTalk.title || parsedTalk.title === '学术报告' || PLACEHOLDER_TEXT_REGEX.test(parsedTalk.title)) {
    const mColon = text.match(/(?:学术报告|学术讲座|讲座|报告)\s*[:：]\s*([^\n\r]{3,100})/)
    if (mColon && !/^(?:时间|地点|报告人|主讲人|举办|通知)/.test(mColon[1].trim())) {
      parsedTalk.title = mColon[1].trim()
    }
  }

  // 规范化机构地点前缀
  parsedTalk.location = applyInstitutionLocationPrefix(parsedTalk.location, text)
  parsedTalk.title = pickChinesePartIfDual(parsedTalk.title || '学术报告')
  if (PLACEHOLDER_TEXT_REGEX.test(parsedTalk.title)) {
    parsedTalk.title = posterUrl ? '学术报告（海报）' : '学术报告'
  }
  parsedTalk.speaker = pickChinesePartIfDual(parsedTalk.speaker || '')

  return {
    title: parsedTalk.title,
    date: parsedTalk.date || shanghaiToday(),
    time: parsedTalk.time || '10:00',
    speaker: parsedTalk.speaker || '',
    location: parsedTalk.location || '',
    notes: parsedTalk.notes || text.trim(),
    poster_url: posterUrl || '',
    attachments: validFiles
  }
}

/**
 * AI 自动识别填充卡片
 * @param {string} text - 原始或整合后的文本
 * @param {'talk' | 'conference' | 'notice'} type - 目标类型
 * @param {Object} options - 配置 { config, imageUrls, files, signal }
 * @returns {Promise<Object>} AI 深度提取字段对象
 */
export async function extractFieldsWithAi(text = '', type = 'talk', { config, imageUrls = [], files = [], signal } = {}) {
  const posterUrl = (Array.isArray(imageUrls) && imageUrls.length > 0) ? imageUrls[0] : ''
  const validFiles = Array.isArray(files) ? files : []
  const trimmed = (text || '').trim()
  const isPlaceholderOnly = !trimmed || PLACEHOLDER_TEXT_REGEX.test(trimmed)
  const cleanInputText = isPlaceholderOnly ? '' : trimmed

  if (type === 'notice') {
    const atts = []
    if (Array.isArray(imageUrls)) {
      imageUrls.forEach((img, idx) => {
        atts.push({
          id: `img-${idx}`,
          filename: `海报图片-${idx + 1}.jpg`,
          url: img,
          content_type: 'image/jpeg'
        })
      })
    }
    validFiles.forEach((f, idx) => {
      atts.push({
        id: f.id || `file-${idx}`,
        filename: f.filename || f.name || `附件-${idx + 1}`,
        url: f.url,
        content_type: f.content_type || 'application/octet-stream',
        size: f.size || 0
      })
    })
    return await extractSingleNoticeWithAi(cleanInputText, {
      config,
      signal,
      attachments: atts,
      posterImageUrl: posterUrl
    })
  }

  const dummyEmail = {
    subject: cleanInputText ? (cleanInputText.split(/\r?\n/)[0]?.slice(0, 100) || '') : '',
    body_text: cleanInputText,
    snippet: cleanInputText ? cleanInputText.slice(0, 500) : '',
    poster_url: posterUrl
  }

  if (type === 'conference') {
    const res = await extractConferenceFromEmailWithAi(dummyEmail, {
      config,
      posterImageUrl: posterUrl,
      signal
    })
    return {
      ...res,
      poster_url: posterUrl || res.poster_url || '',
      attachments: validFiles
    }
  }

  // 报告 (talk) AI 解析
  const res = await extractScheduleFromEmailWithAi(dummyEmail, {
    config,
    posterImageUrl: posterUrl,
    signal
  })

  return {
    title: res.title || (posterUrl ? '学术报告（海报）' : '学术报告'),
    date: res.date || shanghaiToday(),
    time: res.time || '10:00',
    speaker: res.speaker || '',
    location: res.location || '',
    notes: res.notes || cleanInputText || (posterUrl ? '详见随附海报' : ''),
    poster_url: posterUrl || res.poster_url || '',
    attachments: validFiles
  }
}
