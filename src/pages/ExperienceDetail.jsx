import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ExperienceFields, { toApi, fromApi } from '../components/ExperienceFields.jsx'
import TagList from '../components/TagList.jsx'
import Markdown from '../components/Markdown.jsx'
import { getExperience, updateExperience, deleteExperience } from '../api'

const SECTIONS = [['situation', 'Situation'], ['problem', 'Problem'], ['action', 'Action'], ['result', 'Result']]

export default function ExperienceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [exp, setExp] = useState(null)
  const [form, setForm] = useState(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getExperience(id).then(setExp).catch((e) => setError(e.message))
  }, [id])

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const updated = await updateExperience(id, toApi(form))
      setExp(updated); setEditing(false)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function onDelete() {
    if (!confirm('이 경험을 삭제할까요?')) return
    setBusy(true)
    try { await deleteExperience(id); navigate('/experiences') }
    catch (err) { setError(err.message); setBusy(false) }
  }

  if (error && !exp) return <p className="error">{error}</p>
  if (!exp) return <p className="el-muted">불러오는 중…</p>

  if (editing) {
    return (
      <form onSubmit={save} className="editorial-page">
        <Link to="/experiences" className="el-back">← 목록</Link>
        <h1>경험 수정</h1>
        <ExperienceFields value={form} onChange={setForm} />
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="el-btn" disabled={busy}>{busy ? '저장 중… (재임베딩)' : '저장'}</button>
          <button type="button" className="el-ghost" onClick={() => setEditing(false)}>취소</button>
        </div>
      </form>
    )
  }

  return (
    <article className="editorial-page">
      <Link to="/experiences" className="el-back">← 목록</Link>
      <div className="list-head">
        <h1>{exp.title}</h1>
        <button className="el-danger" onClick={onDelete} disabled={busy}>삭제</button>
      </div>
      <div className="el-muted">{[exp.company, exp.project, exp.period].filter(Boolean).join(' · ')}</div>
      {['technologies', 'roles', 'keywords'].map((k) => exp[k]?.length > 0 && (
        <div key={k}>
          <span className="el-muted small">{k}</span>
          <TagList tags={exp[k]} />
        </div>
      ))}
      {error && <p className="error">{error}</p>}

      {SECTIONS.map(([k, label]) => exp[k] && (
        <section key={k}><h3>{label}</h3><Markdown>{exp[k]}</Markdown></section>
      ))}

      <div className="actions">
        <button className="el-ghost" onClick={() => { setForm(fromApi(exp)); setEditing(true) }}>수정</button>
        <button className="el-ghost" onClick={() => navigate(`/experiences/${id}/chat`)}>대화로 수정</button>
      </div>

      {exp.metrics?.length > 0 && (
        <div>
          <span className="el-muted small">metrics</span>
          <TagList tags={exp.metrics} />
        </div>
      )}
      {exp.rawMemo && <section><h3>원본 메모</h3><Markdown className="el-muted">{exp.rawMemo}</Markdown></section>}
    </article>
  )
}
