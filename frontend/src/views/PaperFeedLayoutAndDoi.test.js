import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('Paper Feed Layout, Safari Compatibility & DOI Abstract Resolution', () => {
  const arxivFeedVue = readFileSync(resolve(__dirname, 'ArxivFeedView.vue'), 'utf-8')
  const recommendationAudienceVue = readFileSync(resolve(__dirname, '../components/RecommendationAudience.vue'), 'utf-8')
  const indexCss = readFileSync(resolve(__dirname, '../index.css'), 'utf-8')
  const papersTs = readFileSync(resolve(__dirname, '../../functions/api/utils/papers.ts'), 'utf-8')
  const paperServicePy = readFileSync(resolve(__dirname, '../../../backend/services/paper_service.py'), 'utf-8')

  it('prevents recommendation scope legend from wrapping on Safari', () => {
    expect(recommendationAudienceVue).toContain('.audience legend')
    expect(recommendationAudienceVue).toContain('white-space:nowrap !important')
    expect(recommendationAudienceVue).toContain('min-width:max-content')
  })

  it('structures paper meta into info and action flex containers to avoid button collision', () => {
    expect(arxivFeedVue).toContain('class="paper-meta-info"')
    expect(arxivFeedVue).toContain('class="paper-meta-actions"')
    expect(arxivFeedVue).toContain('.paper-meta-actions')
    expect(arxivFeedVue).not.toContain('position: absolute;\n  left: 21px;\n  bottom: 21px;')
  })

  it('eliminates scroll flicker by removing content-visibility and card backdrop blur', () => {
    expect(arxivFeedVue).not.toContain('content-visibility: auto;')
    expect(arxivFeedVue).not.toContain('contain-intrinsic-size: auto 240px;')
    const sharedCardLine = indexCss.split('\n').find(l => l.includes('.app-shell .paper-row') && l.includes('.app-shell .recommend-panel'))
    expect(sharedCardLine).toBeDefined()
    expect(sharedCardLine).not.toContain('backdrop-filter:blur')
    expect(sharedCardLine).not.toContain('transform:translateZ(0)')
  })

  it('queries arXiv directly via search_query=doi in fetchDoiMetadata', () => {
    expect(papersTs).toContain('export async function fetchDoiMetadata(doi: string)')
    expect(papersTs).toContain('export.arxiv.org/api/query?search_query=doi:')
    expect(papersTs).toContain('api.semanticscholar.org/graph/v1/paper/DOI:')
  })

  it('preserves abstract and avoids wiping in backend paper_service.py', () => {
    expect(paperServicePy).not.toContain("result['abstract'] = ''")
    expect(paperServicePy).toContain('api.semanticscholar.org')
  })
})
