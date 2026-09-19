import io
import re
import csv
import zipfile
import datetime
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_
from ..models import User


def parse_date_cell(val: Any, current_year: int, prev_month: Optional[int] = None) -> Tuple[Optional[str], Optional[int]]:
    """解析日期单元格，支持 Excel 序列号、带年份格式、无年份格式及跨年推算。"""
    if val is None:
        return None, prev_month
    val_str = str(val).strip()
    if not val_str or '跳过' in val_str or val_str.lower() in ('none', 'null'):
        return None, prev_month

    # 1. Excel 序列号 (e.g. 46274 -> 2026-09-09)
    if val_str.isdigit() and int(val_str) > 30000:
        d = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=int(val_str))
        return d.strftime('%Y-%m-%d'), d.month

    # 2. 包含 4 位年份的日期: 2026-09-09, 2026/09/09, 2026.09.09, 2026年9月9日
    m = re.match(r'^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$', val_str)
    if m:
        y, mo, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f'{y:04d}-{mo:02d}-{day:02d}', mo

    # 3. 不带年份的日期: 9.9, 9-9, 9/9, 9月9日, 09-09
    m = re.match(r'^(\d{1,2})[-/.](\d{1,2})日?$', val_str) or re.match(r'^(\d{1,2})月(\d{1,2})日?$', val_str)
    if m:
        mo, day = int(m.group(1)), int(m.group(2))
        year = current_year
        # 若之前月份较大（如 11 或 12 月），而当前行为 1 月或 2 月，则自动顺延至下一自然年
        if prev_month and prev_month >= 9 and mo < 6:
            year += 1
        return f'{year:04d}-{mo:02d}-{day:02d}', mo

    return None, prev_month


def clean_person_name(name: str) -> str:
    """清理姓名中包含的备注信息，如 '张三（待定）' -> '张三'"""
    if not name:
        return ""
    name = re.sub(r'[\(（].*?[\)）]', '', name)
    return name.strip()


def parse_sharers(val: Any) -> List[str]:
    """解析 arXiv 分享人字段，支持逗号、顿号、空格分隔，忽略 ～ 占位符"""
    if not val:
        return []
    val_str = str(val).strip()
    if val_str in ('～', '~', '无', '-', '--', 'none', 'None'):
        return []
    parts = re.split(r'[,，、\s]+', val_str)
    names = []
    for p in parts:
        cleaned = clean_person_name(p)
        if cleaned and cleaned not in ('～', '~', '无', '待定'):
            names.append(cleaned)
    return names


def match_user_by_name(db: Optional[Session], name: str) -> Optional[User]:
    """在数据库中按姓名、实名或昵称模糊/精确查找注册成员"""
    if not db or not name:
        return None
    candidates = db.query(User).filter(
        or_(User.name == name, User.real_name == name, User.nickname == name)
    ).all()
    return candidates[0] if len(candidates) == 1 else None


def analyze_matrix_and_extract(raw_rows: List[Dict[str, Any]], db: Optional[Session] = None, current_year: Optional[int] = None) -> Tuple[str, List[Dict[str, Any]]]:
    """从行列字典结构中提取排期数据"""
    if current_year is None:
        current_year = datetime.date.today().year

    default_time = "10:00"
    header_idx = -1
    col_map = {}

    # 1. 扫描标题时间与列对应关系
    for idx, row in enumerate(raw_rows[:15]):
        for val in row.values():
            m = re.search(r'(\d{1,2}:\d{2})', str(val))
            if m:
                default_time = m.group(1)

        vals = {col: str(v).strip() for col, v in row.items()}
        has_presenter = any('报告人' in v or '主讲' in v for v in vals.values())
        has_date = any('日期' in v or '时间' in v for v in vals.values())
        if has_presenter and has_date:
            header_idx = idx
            for col, v in vals.items():
                if '报告人' in v or '主讲' in v:
                    col_map['presenter'] = col
                elif '日期' in v or '时间' in v or '预计时间' in v:
                    col_map['date'] = col
                elif 'arxiv' in v.lower() or '分享' in v:
                    col_map['arxiv'] = col
            break

    # 若未匹配到列映射，尝试按顺序 A/B/C 兜底
    if 'date' not in col_map or 'presenter' not in col_map:
        keys = list(raw_rows[0].keys()) if raw_rows else []
        if len(keys) >= 2:
            col_map['presenter'] = keys[0]
            col_map['date'] = keys[1]
            if len(keys) >= 3:
                col_map['arxiv'] = keys[2]
            header_idx = 0

    results = []
    prev_month = None

    # 2. 遍历数据行
    for row in raw_rows[header_idx + 1:]:
        presenter_val = str(row.get(col_map.get('presenter', ''), '')).strip()
        date_val = str(row.get(col_map.get('date', ''), '')).strip()
        arxiv_val = str(row.get(col_map.get('arxiv', ''), '')).strip()

        # 跳过空行或标记了跳过的节假日/会议
        if not presenter_val and not date_val and not arxiv_val:
            continue
        if any(skip_word in presenter_val for skip_word in ('跳过', '假期', '放假', '会议', '答辩')):
            continue
        if any(skip_word in date_val for skip_word in ('跳过', '假期', '放假', '会议', '答辩')):
            continue

        date_str, prev_month = parse_date_cell(date_val, current_year=current_year, prev_month=prev_month)
        if not date_str:
            continue

        # 报告人处理
        clean_p = clean_person_name(presenter_val)
        if clean_p in ('～', '~', '无', '待定'):
            clean_p = ""

        presenter_user = match_user_by_name(db, clean_p) if clean_p else None

        # arXiv 分享人处理
        sharer_names = parse_sharers(arxiv_val)
        presentations = []
        for s_name in sharer_names:
            s_user = match_user_by_name(db, s_name)
            presentations.append({
                "presenter_name": s_name,
                "presenter_id": s_user.id if s_user else None,
                "arxiv_id": "",
                "slides_url": ""
            })

        # 若既无主讲人也无分享人，则跳过
        if not clean_p and not presentations:
            continue

        topic = "工作汇报（待定）" if clean_p else "arXiv 文献分享"

        results.append({
            "date": date_str,
            "time": default_time,
            "presenter_name": clean_p,
            "presenter_id": presenter_user.id if presenter_user else None,
            "topic": topic,
            "location": "待定",
            "presentations": presentations
        })

    return default_time, results


def parse_schedule_file(file_bytes: bytes, filename: str = "", sheet_name: Optional[str] = None, current_year: Optional[int] = None, db: Optional[Session] = None) -> Dict[str, Any]:
    """解析上传的排期文件（支持 .xlsx 与 .csv / .tsv）"""
    is_zip = file_bytes[:4] == b'PK\x03\x04' or filename.lower().endswith('.xlsx')

    if is_zip:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            # 1. sharedStrings.xml
            shared_strings = []
            if 'xl/sharedStrings.xml' in z.namelist():
                tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
                ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                for si in tree.findall('.//ns:si', ns):
                    text = ''.join([t.text or '' for t in si.findall('.//ns:t', ns)])
                    shared_strings.append(text)

            # 2. workbook.xml sheets
            wb_tree = ET.fromstring(z.read('xl/workbook.xml'))
            ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            sheets = [s.attrib['name'] for s in wb_tree.findall('.//ns:sheet', ns)]
            if not sheets:
                sheets = ['Sheet1']

            target_sheet = sheet_name if (sheet_name and sheet_name in sheets) else sheets[-1]
            idx = sheets.index(target_sheet) + 1
            sheet_file = f'xl/worksheets/sheet{idx}.xml'
            if sheet_file not in z.namelist():
                candidates = [f for f in z.namelist() if f.startswith('xl/worksheets/sheet') and f.endswith('.xml')]
                sheet_file = candidates[-1] if candidates else 'xl/worksheets/sheet1.xml'

            sheet_data = ET.fromstring(z.read(sheet_file))
            raw_rows = []
            for row in sheet_data.findall('.//ns:row', ns):
                cells = {}
                for c in row.findall('ns:c', ns):
                    r_coord = c.attrib.get('r', '')
                    col = ''.join(filter(str.isalpha, r_coord))
                    t = c.attrib.get('t', '')
                    v = c.find('ns:v', ns)
                    val = v.text if v is not None else ''
                    if t == 's' and val.isdigit() and int(val) < len(shared_strings):
                        val = shared_strings[int(val)]
                    cells[col] = val
                raw_rows.append(cells)

            default_time, rows = analyze_matrix_and_extract(raw_rows, db=db, current_year=current_year)
            return {
                "format": "xlsx",
                "sheets": sheets,
                "selected_sheet": target_sheet,
                "default_time": default_time,
                "rows": rows
            }

    # 处理 CSV / TSV 文本格式
    text = ""
    for encoding in ('utf-8-sig', 'utf-8', 'gb18030', 'gbk'):
        try:
            text = file_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    return parse_schedule_text(text, db=db, current_year=current_year)


def parse_schedule_text(text: str, db: Optional[Session] = None, current_year: Optional[int] = None) -> Dict[str, Any]:
    """解析 CSV 或制表符分隔的排期文本"""
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    if not lines:
        return {"format": "text", "sheets": [], "selected_sheet": None, "default_time": "10:00", "rows": []}

    delimiter = '\t' if '\t' in lines[0] else ','
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    raw_rows = []
    for r in reader:
        row_dict = {}
        for idx, val in enumerate(r):
            col_letter = chr(ord('A') + idx) if idx < 26 else f'C{idx}'
            row_dict[col_letter] = val.strip()
        raw_rows.append(row_dict)

    default_time, rows = analyze_matrix_and_extract(raw_rows, db=db, current_year=current_year)
    return {
        "format": "text",
        "sheets": [],
        "selected_sheet": None,
        "default_time": default_time,
        "rows": rows
    }
