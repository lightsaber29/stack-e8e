import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ExperienceFields, { toApi } from '../components/ExperienceFields.jsx'
import { createExperience } from '../api'

export default function ExperienceForm() {
  const [form, setForm] = useState({ title: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function submit(e) {
    e.preventDefault()
    if (!form.title?.trim()) { setError('제목은 필수입니다.'); return }
    setSaving(true)
    setError('')
    try {
      const created = await createExperience(toApi(form))
      navigate(`/experiences/${created.id}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="editorial-page">
      <h1>새 경험 등록</h1>
      <p className="el-muted">저장하면 로컬 임베딩이 생성되어 검색 대상에 포함됩니다.</p>
      <ExperienceFields value={form} onChange={setForm} />
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="el-btn" disabled={saving}>{saving ? '저장 중… (임베딩 생성)' : '저장'}</button>
      </div>
    </form>
  )
}
