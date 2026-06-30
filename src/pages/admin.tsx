import { useEffect, useState } from 'react'
import { spaces } from '@/data/spaces'

export default function Admin() {
  const [logoPath, setLogoPath] = useState('')
  const [disabledIds, setDisabledIds] = useState<string[]>([])
  const [disabledNames, setDisabledNames] = useState<string[]>([])
  const [spaceOverrides, setSpaceOverrides] = useState<Record<string, { name?: string; image?: string }>>({})
  const [hideDisabled, setHideDisabled] = useState<boolean>(false)
  const [formFields, setFormFields] = useState<Record<string, { show?: boolean; required?: boolean; label?: string }>>({})
  const [eventFilters, setEventFilters] = useState<{ spacesOnly?: boolean; allowKeywords?: string[]; ignoreKeywords?: string[] }>({ spacesOnly: false, allowKeywords: [], ignoreKeywords: [] })
  const [googleCalendarId, setGoogleCalendarId] = useState<string>('')
  const [useGoogleColors, setUseGoogleColors] = useState<boolean>(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const load = async () => {
      const r = await fetch('/api/admin/config')
      if (r.ok) {
        const data = await r.json()
        setLogoPath(data.logoPath || '/images/logo.png')
        setDisabledIds(Array.isArray(data.disabledSpaceIds) ? data.disabledSpaceIds.map(String) : [])
        setDisabledNames(Array.isArray(data.disabledSpaceNames) ? data.disabledSpaceNames.map(String) : [])
        setSpaceOverrides(typeof data.spaceOverrides === 'object' ? data.spaceOverrides : {})
        setHideDisabled(!!data.hideDisabled)
        setFormFields(typeof data.formFields === 'object' ? data.formFields : {})
        setEventFilters(typeof data.eventFilters === 'object' ? data.eventFilters : { spacesOnly: false, allowKeywords: [], ignoreKeywords: [] })
        setGoogleCalendarId(typeof data.googleCalendarId === 'string' ? data.googleCalendarId : '')
        setUseGoogleColors(typeof data.useGoogleColors === 'boolean' ? data.useGoogleColors : true)
      }
    }
    load()
  }, [])

  const toggleId = (id: string) => {
    setDisabledIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleName = (name: string) => {
    setDisabledNames((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]))
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    const r = await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logoPath, disabledSpaceIds: disabledIds, disabledSpaceNames: disabledNames, spaceOverrides, hideDisabled, formFields, eventFilters, googleCalendarId, useGoogleColors })
    })
    setSaving(false)
    setSaved(r.ok)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-6">後台管理</h1>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">LOGO 設定</h2>
          <input
            className="input-field w-full"
            value={logoPath}
            onChange={(e) => setLogoPath(e.target.value)}
            placeholder="/images/my-logo.svg"
          />
          <p className="text-sm text-gray-500 mt-2">輸入 public 目錄下的圖片路徑（SVG/PNG/JPG）</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Google 行事曆設定</h2>
          <label className="form-label">Calendar ID</label>
          <input
            className="input-field w-full"
            value={googleCalendarId}
            onChange={(e) => setGoogleCalendarId(e.target.value)}
            placeholder="例如 your_calendar_id@group.calendar.google.com"
          />
          <p className="text-sm text-gray-500 mt-2">若設定此欄位，將覆蓋環境變數 CALENDAR_ID</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">行事曆事件顯示</h2>
          <label className="flex items-center gap-2 mb-4">
            <input type="checkbox" checked={useGoogleColors} onChange={(e) => setUseGoogleColors(e.target.checked)} />
            <span>沿用 Google 事件標色</span>
          </label>
          <label className="flex items-center gap-2 mb-4">
            <input type="checkbox" checked={!!eventFilters.spacesOnly} onChange={(e) => setEventFilters((prev) => ({ ...prev, spacesOnly: e.target.checked }))} />
            <span>僅顯示包含空間名稱的事件</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">忽略關鍵字（以逗號分隔）</label>
              <input
                className="input-field"
                value={(eventFilters.ignoreKeywords || []).join(',')}
                onChange={(e) => setEventFilters((prev) => ({ ...prev, ignoreKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))}
                placeholder="例：地板打蠟, 清潔"
              />
            </div>
            <div>
              <label className="form-label">允許關鍵字（以逗號分隔）</label>
              <input
                className="input-field"
                value={(eventFilters.allowKeywords || []).join(',')}
                onChange={(e) => setEventFilters((prev) => ({ ...prev, allowKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))}
                placeholder="例：創新基地, 小會議室"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">顯示設定</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hideDisabled} onChange={(e) => setHideDisabled(e.target.checked)} />
            <span>隱藏暫停預約的空間</span>
          </label>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">預約表單設定</h2>
          {[
            { key: 'unit', label: '申請單位類別' },
            { key: 'department', label: '申請單位' },
            { key: 'departmentName', label: '單位名稱' },
            { key: 'name', label: '申請者姓名' },
            { key: 'phone', label: '聯繫電話' },
            { key: 'email', label: 'Email' },
            { key: 'participants', label: '預估參加人數' },
            { key: 'date', label: '借用日期' },
            { key: 'startTime', label: '起始時間' },
            { key: 'endTime', label: '結束時間' },
            { key: 'purpose', label: '用途' },
          ].map((f) => {
            const cfg = formFields[f.key] || {}
            return (
              <div key={f.key} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                <div>
                  <label className="form-label">{f.label} 顯示</label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!cfg.show}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, [f.key]: { ...prev[f.key], show: e.target.checked } }))}
                    />
                    <span>顯示</span>
                  </label>
                </div>
                <div>
                  <label className="form-label">{f.label} 必填</label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!cfg.required}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, [f.key]: { ...prev[f.key], required: e.target.checked } }))}
                    />
                    <span>必填</span>
                  </label>
                </div>
                <div>
                  <label className="form-label">欄位標籤</label>
                  <input
                    className="input-field"
                    value={cfg.label ?? f.label}
                    onChange={(e) => setFormFields((prev) => ({ ...prev, [f.key]: { ...prev[f.key], label: e.target.value } }))}
                    placeholder={f.label}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">空間設定</h2>
          <div className="space-y-4">
            {spaces.map((s) => {
              const o = spaceOverrides[s.id] || {}
              return (
                <div key={s.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div>
                    <label className="form-label">顯示名稱（ID: {s.id}）</label>
                    <input
                      className="input-field"
                      value={o.name ?? s.name}
                      onChange={(e) => setSpaceOverrides((prev) => ({ ...prev, [s.id]: { ...prev[s.id], name: e.target.value } }))}
                      placeholder={s.name}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="form-label">圖片路徑</label>
                    <input
                      className="input-field"
                      value={o.image ?? s.image}
                      onChange={(e) => setSpaceOverrides((prev) => ({ ...prev, [s.id]: { ...prev[s.id], image: e.target.value } }))}
                      placeholder={s.image}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">暫停預約管理</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium mb-2">依空間 ID</h3>
              <div className="space-y-2">
                {spaces.map((s) => (
                  <label key={s.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={disabledIds.includes(s.id)} onChange={() => toggleId(s.id)} />
                    <span>{s.name}（ID: {s.id}）</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-medium mb-2">依空間名稱</h3>
              <div className="space-y-2">
                {spaces.map((s) => (
                  <label key={s.name} className="flex items-center gap-2">
                    <input type="checkbox" checked={disabledNames.includes(s.name)} onChange={() => toggleName(s.name)} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={save} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700" disabled={saving}>
            {saving ? '儲存中...' : '儲存設定'}
          </button>
          {saved && <span className="text-green-600">已儲存</span>}
        </div>
      </div>
    </div>
  )
}
