import { describe, expect, it } from 'vitest'
import { escapeHtml, extractApplicant, sanitizeMultiline, sanitizeText } from '@/utils/sanitize'

describe('sanitizeText', () => {
  it('移除 HTML 標籤與角括號', () => {
    const result = sanitizeText('<img src=x onerror=alert(1)>王小明')
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
    expect(result).toContain('王小明')
  })

  it('移除控制字元並壓縮空白', () => {
    expect(sanitizeText('a\u0000b   c')).toBe('ab c')
  })

  it('限制長度', () => {
    expect(sanitizeText('x'.repeat(100), 10)).toHaveLength(10)
  })

  it('非字串與空值回傳空字串', () => {
    expect(sanitizeText(undefined)).toBe('')
    expect(sanitizeText(null)).toBe('')
  })
})

describe('sanitizeMultiline', () => {
  it('保留換行但移除標籤', () => {
    const result = sanitizeMultiline('第一行<script>alert(1)</script>\n第二行')
    expect(result).toContain('第一行')
    expect(result).toContain('第二行')
    expect(result).not.toContain('<script>')
  })
})

describe('extractApplicant', () => {
  it('從 description 取出申請者', () => {
    expect(extractApplicant('[SPACE:3]\n申請者：王小明\n電話：0912345678')).toBe('王小明')
  })

  it('沒有申請者時回傳空字串', () => {
    expect(extractApplicant('沒有這個欄位')).toBe('')
    expect(extractApplicant(null)).toBe('')
  })
})

describe('escapeHtml', () => {
  it('轉義所有危險字元', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  })
})
