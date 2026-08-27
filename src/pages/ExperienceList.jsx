import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import TagList from '../components/TagList.jsx'
import { listExperiences } from '../api'

export default function ExperienceList() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function reload() {
    setLoading(true)
    try {
      setItems(await listExperiences())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { reload() }, [])

  return (
    <div className="editorial-page">
      <div className="list-head">
        <h1>경험 목록 <span className="el-muted">({items.length})</span></h1>
        <div>
          <Link to="/experiences/new" className="el-btn">+ 새 경험</Link>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? <p className="el-muted">불러오는 중…</p> : (
        items.length === 0 ? (
          <p className="el-muted">아직 등록된 경험이 없습니다. “새 경험”으로 시작하세요.</p>
        ) : (
          <ul className="el-grid">
            {items.map((e, i) => (
              <li key={e.id} style={{ '--i': i }}>
                <Link to={`/experiences/${e.id}`} className="el-card">
                  <div className="el-title">{e.title}</div>
                  <div className="el-muted small">
                    {[e.company, e.project, e.period].filter(Boolean).join(' · ')}
                  </div>
                  {e.problem && <div className="el-clamp">{e.problem}</div>}
                  <TagList tags={e.keywords} />
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
