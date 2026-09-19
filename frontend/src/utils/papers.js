export const isJournal = paper => /^(doi:|url:|custom:)/i.test(paper.arxiv_id || '')
export const paperLabel = paper => !paper.arxiv_id ? (paper.journal || '期刊论文') : paper.arxiv_id.startsWith('doi:') ? `DOI:${paper.arxiv_id.slice(4)}` : paper.arxiv_id.startsWith('url:') ? (paper.journal || '期刊论文') : paper.arxiv_id.startsWith('custom:') ? '组会文献' : `arXiv:${paper.arxiv_id}`
export const paperSource = paper => paper.source_url || (paper.arxiv_id?.startsWith('doi:') ? `https://doi.org/${paper.arxiv_id.slice(4)}` : isJournal(paper) ? '' : `https://arxiv.org/abs/${paper.arxiv_id}`)
export const paperRead = paper => paper.pdf_url || (isJournal(paper) ? paperSource(paper) : `https://arxiv.org/pdf/${paper.arxiv_id}`)
export const paperReadLabel = paper => !paper.pdf_url && isJournal(paper) ? '文献原文 ↗' : '打开 PDF ↗'
