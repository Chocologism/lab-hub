import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'

describe('PaperChatBox Adaptive Cursor Polling Integration', () => {
  const chatBoxPath = path.resolve(__dirname, 'PaperChatBox.vue')
  const chatBoxContent = fs.readFileSync(chatBoxPath, 'utf8')
  const parsedChatBox = parse(chatBoxContent)

  const feedPath = path.resolve(__dirname, '../views/ArxivFeedView.vue')
  const feedContent = fs.readFileSync(feedPath, 'utf8')
  const parsedFeed = parse(feedContent)

  it('imports and invokes usePaperCommentsPolling with reactive states in PaperChatBox.vue', () => {
    const script = parsedChatBox.descriptor.scriptSetup?.content || ''
    expect(script).toContain("import { usePaperCommentsPolling } from '../composables/usePaperCommentsPolling'")
    expect(script).toContain('const isFocused = ref(false)')
    expect(script).toContain('const hasDraft = computed(() => Boolean(draft.value.trim()))')
    expect(script).toContain('usePaperCommentsPolling(')
    expect(script).toContain('targetEl: chatBoxRef')
    expect(script).toContain('onNewComments:')
    expect(script).toContain('onCommentDeleted:')
  })

  it('broadcasts comment additions and deletions in PaperChatBox.vue', () => {
    const script = parsedChatBox.descriptor.scriptSetup?.content || ''
    expect(script).toContain('broadcastCommentAdded(newComment)')
    expect(script).toContain('broadcastCommentDeleted(comment.id)')
  })

  it('binds @focus and @blur handlers to the input element in PaperChatBox.vue', () => {
    const template = parsedChatBox.descriptor.template?.content || ''
    expect(template).toContain('@focus="isFocused = true"')
    expect(template).toContain('@blur="isFocused = false"')
  })

  it('deduplicates comments by id in ArxivFeedView.vue onCommentAdded', () => {
    const script = parsedFeed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('function onCommentAdded(paper, comment)')
    expect(script).toContain('!paper.comments.some(c => c.id === comment.id)')
  })
})
