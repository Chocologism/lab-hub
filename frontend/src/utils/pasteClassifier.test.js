import { describe, it, expect } from 'vitest'
import { classifyPastedText, extractFieldsByRule, extractNoticeFieldsLocally } from './pasteClassifier'

describe('pasteClassifier', () => {
  describe('classifyPastedText', () => {
    it('correctly classifies academic talk text', () => {
      const talkText = `
        学术报告通知
        主讲人：张三 教授（南京大学天文与空间科学学院）
        报告题目：超新星遗迹中的高能宇宙射线加速机制
        时间：2026年9月25日 10:00 - 11:30
        地点：天文楼302会议室 / 腾讯会议：123-456-789
        报告摘要：本报告将介绍高能伽马射线观测对超新星遗迹加速宇宙线质子的最新约束...
      `
      expect(classifyPastedText(talkText)).toBe('talk')
    })

    it('correctly classifies academic conference text', () => {
      const confText = `
        第二十一届中国天体物理学年会（第一轮通知）
        由中国天文学会主办，定于2026年10月15日至19日在江苏省南京市召开。
        会议主题涵盖星系宇宙学、恒星与致密天体、高能天体物理等。
        重要日期：
        摘要提交截止：2026年9月10日
        早鸟注册截止：2026年9月20日
        正式注册截止：2026年10月1日
        会议官网：https://conf.astronomy.cn/2026
      `
      expect(classifyPastedText(confText)).toBe('conference')
    })

    it('correctly classifies scholarship notice text', () => {
      const noticeText = `
        关于开展2026年秋季学期研究生国家奖学金评定申报工作的通知
        各院系、全体研究生：
        根据教育部和学校研究生院相关文件精神，现启动2026年度国家奖学金评审工作。
        申报材料提交截止时间为2026年9月30日17:00，逾期不予受理。
        请符合条件的同学在研究生教务系统中提交申请表，并将导师签字的纸质版送至后勤楼203。
        特此通知。
      `
      expect(classifyPastedText(noticeText)).toBe('notice')
    })

    it('correctly classifies facility and holiday notices', () => {
      const facilityText = `
        停水停电通知
        各位老师、同学：
        因园区配电箱改造与供水水箱清洗维保，仙林园区1号楼将于9月23日8:00至18:00暂停供水供电，电梯暂停运行。
        请大家提前做好蓄水和数据备份准备。
      `
      expect(classifyPastedText(facilityText)).toBe('notice')

      const holidayText = `
        关于2026年中秋节与国庆节放假调休安排的通告
        全校各单位：
        现将2026年中秋节、国庆节放假调休日期安排通知如下：
        10月1日至10月7日放假调休，共7天。9月27日（周日）、10月10日（周六）上班补课。
      `
      expect(classifyPastedText(holidayText)).toBe('notice')
    })
  })

  describe('extractFieldsByRule', () => {
    it('extracts fields for talk type', () => {
      const talkText = `
        学术报告通知
        主讲人：李四 研究员
        报告题目：系外行星大气的透射光谱分析
        时间：2026年9月28日 14:30
        地点：科研楼 5-516 会议室
        摘要：介绍 James Webb 空间望远镜关于气态巨行星大气的最新探测成果。
      `
      const fields = extractFieldsByRule(talkText, 'talk', { imageUrls: ['https://example.com/poster.png'] })
      expect(fields.title).toContain('系外行星大气的透射光谱分析')
      expect(fields.speaker).toContain('李四')
      expect(fields.date).toBe('2026-09-28')
      expect(fields.time).toBe('14:30')
      expect(fields.location).toContain('科研楼')
      expect(fields.poster_url).toBe('https://example.com/poster.png')
    })

    it('extracts fields for conference type', () => {
      const confText = `
        关于举办2026年银河系结构研讨会的通知
        由南京大学天文与空间科学学院主办。
        会议时间：2026年11月5日 - 2026年11月8日
        举办城市：南京
        地点：南京国际会议大酒店
        注册截止：2026年10月20日
        https://galaxy2026.nju.edu.cn
      `
      const fields = extractFieldsByRule(confText, 'conference', { imageUrls: [] })
      expect(fields.title).toBe('2026年银河系结构研讨会')
      expect(fields.date).toBe('2026-11-05')
      expect(fields.end_date).toBe('2026-11-08')
      expect(fields.city).toBe('南京')
      expect(fields.registration_deadline).toBe('2026-10-20')
      expect(fields.website_url).toContain('https://galaxy2026.nju.edu.cn')
    })

    it('extracts fields for notice type', () => {
      const noticeText = `
        关于2026年秋季学期研究生国家奖学金评选工作的通知
        根据教务处部署，请各课题组于2026年9月30日前报送申报名单。
      `
      const fields = extractFieldsByRule(noticeText, 'notice', {
        imageUrls: ['https://example.com/img1.jpg'],
        files: [{ id: 'f1', filename: '申请表.docx', url: '/api/files/f1' }]
      })
      expect(fields.title).toContain('国家奖学金')
      expect(fields.category).toBe('academic_affairs')
      expect(fields.importance).toBe('important')
      expect(fields.end_date).toBe('2026-09-30')
      expect(fields.attachments.length).toBe(2)
      expect(fields.attachments[0].url).toBe('https://example.com/img1.jpg')
      expect(fields.attachments[1].filename).toBe('申请表.docx')
    })

    it('treats placeholder strings like 【随附海报图片】 as empty text and uses clean fallback titles', () => {
      const confFields = extractFieldsByRule('【随附海报图片】', 'conference', {
        imageUrls: ['https://example.com/poster.jpg']
      })
      expect(confFields.title).toBe('学术会议（海报）')
      expect(confFields.notes).toBe('详见随附会议海报')

      const talkFields = extractFieldsByRule('【随附海报图片】', 'talk', {
        imageUrls: ['https://example.com/poster.jpg']
      })
      expect(talkFields.title).toBe('学术报告（海报）')
      expect(talkFields.notes).toBe('详见随附海报')

      const noticeFields = extractFieldsByRule('随附海报', 'notice', {
        imageUrls: ['https://example.com/poster.jpg']
      })
      expect(noticeFields.title).toBe('综合事务通知（附图）')
      expect(noticeFields.content).toBe('详见随附图片')
    })
  })
})
