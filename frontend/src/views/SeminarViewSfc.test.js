import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse, compileScript } from '@vue/compiler-sfc'

describe('SeminarView SFC bindings integrity', () => {
  it('ensures all reactive ref (.value) variables in script setup are declared', () => {
    const filePath = path.resolve(__dirname, 'SeminarView.vue')
    const content = fs.readFileSync(filePath, 'utf8')
    const parsed = parse(content)
    const compiled = compileScript(parsed.descriptor, { id: 'test-seminar-view' })
    const bindings = compiled.bindings || {}

    const refUsage = new Set()
    for (const m of parsed.descriptor.scriptSetup.content.matchAll(/\b([a-zA-Z0-9_$]+)\.value\b/g)) {
      refUsage.add(m[1])
    }

    const missing = []
    for (const name of refUsage) {
      if (!(name in bindings)) {
        missing.push(name)
      }
    }

    expect(missing).toEqual([])
    expect('form' in bindings).toBe(true)
    expect('showEdit' in bindings).toBe(true)
    expect('editId' in bindings).toBe(true)
  })
})
