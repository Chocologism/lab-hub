import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse, compileScript } from '@vue/compiler-sfc'

describe('AssistantView SFC bindings integrity', () => {
  it('ensures all reactive ref (.value) variables in script setup are declared', () => {
    const filePath = path.resolve(__dirname, 'AssistantView.vue')
    const content = fs.readFileSync(filePath, 'utf8')
    const parsed = parse(content)
    const compiled = compileScript(parsed.descriptor, { id: 'test-assistant-view' })
    const bindings = compiled.bindings || {}

    // 排除诸如 e.target.value 等 DOM 属性
    const excludedProperties = new Set(['target'])

    const refUsage = new Set()
    for (const m of parsed.descriptor.scriptSetup.content.matchAll(/(?<!\.)\b([a-zA-Z0-9_$]+)\.value\b/g)) {
      if (!excludedProperties.has(m[1])) {
        refUsage.add(m[1])
      }
    }

    const missing = []
    for (const name of refUsage) {
      if (!(name in bindings)) {
        missing.push(name)
      }
    }

    expect(missing).toEqual([])
    expect('isStreaming' in bindings).toBe(true)
    expect('sessions' in bindings).toBe(true)
    expect('activeSessionId' in bindings).toBe(true)
    expect('currentSession' in bindings).toBe(true)
    expect('isDeactivated' in bindings).toBe(true)
  })
})
