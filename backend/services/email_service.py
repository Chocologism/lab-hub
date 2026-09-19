"""Parse uploaded mail locally. Never render mail HTML or request remote images."""
import re
from datetime import datetime, timedelta
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from zoneinfo import ZoneInfo


class MailHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text, self.images, self.skip = [], [], 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style'):
            self.skip += 1
        if tag in ('p', 'div', 'br', 'tr', 'li', 'h1', 'h2'):
            self.text.append('\n')
        if tag == 'img' and attrs.get('src'):
            self.images.append(attrs['src'])

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)
        if tag in ('p', 'div', 'tr', 'li', 'h1', 'h2'):
            self.text.append('\n')

    def handle_data(self, data):
        if not self.skip:
            self.text.append(data)


def parse_mail(content, filename='', today=None):
    now = today or datetime.now(ZoneInfo('Asia/Shanghai')).date()
    subject, attachments, plain, html = '', [], '', ''
    warnings = []
    if filename.lower().endswith('.eml'):
        mail = BytesParser(policy=policy.default).parsebytes(content)
        subject = str(mail.get('Subject', ''))
        try:
            now = parsedate_to_datetime(mail['Date']).astimezone(ZoneInfo('Asia/Shanghai')).date()
        except (TypeError, ValueError, IndexError):
            warnings.append('未找到邮件发送日期，相对日期以今天为基准，请核对。')
        for part in mail.walk():
            if part.is_multipart():
                continue
            kind = part.get_content_type()
            if kind in ('text/plain', 'text/html') and part.get_content_disposition() != 'attachment':
                value = part.get_content()
                if kind == 'text/plain': plain += value + '\n'
                else: html += value + '\n'
            elif kind in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf'):
                attachments.append({'filename': part.get_filename() or 'poster', 'content_type': kind,
                                    'content': part.get_payload(decode=True), 'cid': str(part.get('Content-ID', '')).strip('<>')})
    else:
        for encoding in ('utf-8-sig', 'gb18030'):
            try:
                plain = content.decode(encoding)
                break
            except UnicodeDecodeError:
                pass
        if not plain:
            raise ValueError('无法读取邮件，请上传 UTF-8/GB18030 文本、HTML 或 .eml 文件')
        if filename.lower().endswith(('.html', '.htm')) or re.search(r'<(?:html|body|div|p)[\s>]', plain, re.I):
            html, plain = plain, ''
    parser = MailHTML()
    parser.feed(html)
    text = plain or ''.join(parser.text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n+', '\n', text).strip()
    def field(labels, src=text):
        match = re.search(rf'(?im)^\s*(?:{labels})\s*[:：]\s*(.+)', src)
        return match.group(1).strip() if match else ''

    title = field('报告题目|报告标题|题目|标题|报告主题|Title|Topic')
    if not title:
        m_title = re.search(r'(?:做题为|题为|题目为|题目是|报告题目|报告主题|报告名称)\s*[：:\s]*[《“]([^》”\n\r]+)[》”]', text)
        if m_title:
            title = m_title.group(1).strip()
        else:
            m_title2 = re.search(r'[《“]([^》”\n\r]{4,100})[》”]\s*(?:的)?(?:学术)?(?:报告|讲座|分享)', text)
            if m_title2:
                title = m_title2.group(1).strip()
    if not title:
        candidate_subject = subject
        if not candidate_subject and text:
            first_line = text.split('\n')[0].strip()
            if len(first_line) < 120 and not re.search(r'^(?:各位|亲爱的|尊敬的|Hi|Hello|Dear)', first_line):
                candidate_subject = first_line
        if candidate_subject:
            s_clean = re.sub(r'\s*(?:时间|地点|日期|Location|Venue|Time|Date)\s*[:：]?\s*.*$', '', candidate_subject, flags=re.I).strip()
            title = s_clean or candidate_subject

    speaker = field('报告人|主讲人|报告嘉宾|主讲嘉宾|Speaker|Presenter')
    if not speaker:
        m_spk_lbl = re.search(r'(?:报告人|主讲人|报告嘉宾|主讲嘉宾|Speaker|Presenter|特邀嘉宾)\s*[:：\s]\s*([^\s,，。；\n\r(（]{2,15})', text, re.I)
        if m_spk_lbl:
            speaker = m_spk_lbl.group(1).strip()
        else:
            titles_list = '特聘研究员|副研究员|助理教授|副教授|研究员|博士后|教授|博士|院士|讲师|主任|老师|同学'
            m_spk_de = re.search(rf'(?:邀请(?:到了|到|了)?|由)(?:[^,，。；\n\r]*?的)\s*([A-Za-z\u4e00-\u9fa5·]{{2,4}}?)\s*({titles_list})', text)
            if m_spk_de:
                speaker = f'{m_spk_de.group(1).strip()} {m_spk_de.group(2).strip()}'
            else:
                m_spk_dir = re.search(rf'(?:邀请(?:到了|到|了)?|由)\s*(?:[^\s,，。、]+?(?:大学|学院|天文台|研究所|实验室|中心|系统|学会|学校|[台院所系]))?\s*([A-Za-z\u4e00-\u9fa5·]{{2,4}}?)\s*({titles_list})', text)
                if m_spk_dir:
                    speaker = f'{m_spk_dir.group(1).strip()} {m_spk_dir.group(2).strip()}'

    location = field('报告地点|地点|Location|Venue')
    if not location:
        m_held = re.search(r'在\s*([^,，。；\n\r]{2,40}?)\s*(?:线上|线下)?(?:举办|举行|召开|进行)', text)
        if m_held and re.search(r'会议室|报告厅|多功能厅|大厦|楼|中心|教室|腾讯会议|Zoom|ZOOM|\d+-\d+', m_held.group(1), re.I):
            location = m_held.group(1).strip()
        else:
            m_loc_inline = re.search(r'(?:报告地点|地点|Location|Venue)\s*[:：\s]?\s*([^,，。；\n\r]{2,30})', text, re.I)
            if m_loc_inline:
                location = m_loc_inline.group(1).strip()

    date_text = field('报告时间|时间|日期|Date|Time|When') or text
    full_dates = re.findall(r'(?<!\d)(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?', date_text)
    date = ''
    try:
        if full_dates:
            values = sorted({datetime(*map(int, parts)).date().isoformat() for parts in full_dates})
            if len(values) == 1: date = values[0]
            else: warnings.append('邮件包含多个日期，请选择本场报告的日期。')
        else:
            md = re.search(r'(?<!\d)(\d{1,2})月(\d{1,2})日?', date_text)
            if md:
                date = datetime(now.year, *map(int, md.groups())).date().isoformat()
                warnings.append('日期未写年份，已按邮件年份推定，请核对。')
            else:
                relative = re.search('今天|今日|明天|明日|后天', date_text)
                if relative:
                    date = (now + timedelta(days={'今天': 0, '今日': 0, '明天': 1, '明日': 1, '后天': 2}[relative.group()])).isoformat()
                else:
                    english = re.search(r'\b([A-Za-z]+\.? \d{1,2},? 20\d{2})\b', date_text)
                    if english:
                        for fmt in ('%B %d %Y', '%b %d %Y'):
                            try: date = datetime.strptime(english.group().replace(',', '').replace('.', ''), fmt).date().isoformat(); break
                            except ValueError: pass
    except ValueError:
        warnings.append('邮件中的日期无效，请手动填写。')

    def extract_time_val(val_text):
        m = re.search(r'(?<!\d)(\d{1,2})[:：](\d{2})\s*(AM|PM)?|(?<!\d)(\d{1,2})[点时](?:(\d{1,2})分?)?', val_text, re.I)
        if not m: return ''
        hour, minute = int(m[1] or m[4]), int(m[2] or m[5] or 0)
        if (m[3] or '').upper() == 'PM' or re.search('下午|晚上', val_text[:m.start()]):
            if hour < 12: hour += 12
        elif (m[3] or '').upper() == 'AM' and hour == 12: hour = 0
        if hour < 24 and minute < 60: return f'{hour:02}:{minute:02}'
        return ''

    time = extract_time_val(date_text)

    if not date: warnings.append('未能确定报告日期，请手动填写。')
    if not time: warnings.append('未能确定开始时间，请手动填写。')
    if not title: warnings.append('未能确定报告标题，请手动填写。')
    urls = [url for url in parser.images if url.startswith(('https://', 'http://', 'cid:'))]
    poster = re.search(r'(?im)(?:海报|Poster)\s*[:：]\s*(https?://\S+)', text)
    if poster: urls.insert(0, poster[1])

    # 多场报告切分检测
    def split_segments(txt):
        explicit_pat = r'(?:^|\n)[ \t]*(?:【|\[|（|\()?[ \t]*(?:第[一二三四五六七八九十1-9]场(?:报告|讲座)?|(?:报告|讲座|Talk|Session|分会场)\s*(?:[一二三四五六七八九十1-9①-⑨]|I{1,3}|IV|V)\b|(?:上午|下午)\s*报告)[ \t]*(?:】|\]|）|\)|[:：、.\s]|\b)'
        m = list(re.finditer(explicit_pat, txt, re.I))
        if len(m) >= 2:
            return [txt[m[i].start():(m[i+1].start() if i+1 < len(m) else len(txt))].strip() for i in range(len(m))]
        m2 = list(re.finditer(r'(?:^|\n)[ \t]*(?:报告(?:题目|标题|主题|名称)|题目|Title|Topic)[ \t]*[:：]', txt, re.I))
        if len(m2) >= 2:
            return [txt[m2[i].start():(m2[i+1].start() if i+1 < len(m2) else len(txt))].strip() for i in range(len(m2))]
        return [txt]

    segments = split_segments(text)
    talks = []
    if len(segments) >= 2:
        for seg in segments:
            t_title = field('报告题目|报告标题|题目|标题|报告主题|Title|Topic', seg)
            if not t_title:
                m_t = re.search(r'(?:做题为|题为|题目为|题目是|报告题目|报告主题|报告名称)\s*[：:\s]*[《“]([^》”\n\r]+)[》”]', seg)
                if m_t: t_title = m_t.group(1).strip()
            t_spk = field('报告人|主讲人|报告嘉宾|主讲嘉宾|Speaker|Presenter', seg)
            t_time = extract_time_val(seg) or time
            t_loc = field('报告地点|地点|Location|Venue', seg) or location
            if t_title or t_spk:
                talks.append({
                    'title': t_title or title or '学术报告',
                    'speaker': t_spk or speaker,
                    'date': date or str(now),
                    'time': t_time or '10:00',
                    'location': t_loc,
                    'notes': seg[:2000] if len(seg) > 30 else text[:2000],
                    'poster_url': urls[0] if urls else ''
                })
        if len(talks) >= 2 and any(t['title'] != talks[0]['title'] or t['speaker'] != talks[0]['speaker'] for t in talks[1:]):
            pass
        else:
            talks = []

    if not talks:
        talks = [{
            'title': title or '学术报告',
            'speaker': speaker,
            'date': date or str(now),
            'time': time or '10:00',
            'location': location,
            'notes': text[:20000],
            'poster_url': urls[0] if urls else ''
        }]

    return {'title': title or (talks[0]['title'] if talks else '学术报告'), 'date': date, 'time': time,
            'speaker': speaker or (talks[0]['speaker'] if talks else ''),
            'location': location or (talks[0]['location'] if talks else ''), 'notes': text[:20000],
            'poster_candidates': urls, 'warnings': warnings, 'talks': talks}, attachments
