import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { search, listExperiences } from '../api'

const EXAMPLES = ['문제를 해결한 경험', '협업한 경험', '성능을 개선한 경험', 'React를 활용한 경험', '실패한 경험']

export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasExperiences, setHasExperiences] = useState(true)

  useEffect(() => {
    listExperiences().then((items) => setHasExperiences(items.length > 0)).catch(() => {})
  }, [])

  async function run(q) {
    const text = (q ?? query).trim()
    if (!text) return
    setQuery(text)
    setLoading(true)
    setError('')
    try {
      const data = await search(text, 5)
      setResults(data.results)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="editorial-page">
      <h1>경험 검색</h1>
      <p className="el-muted">자연어로 물어보면 의미가 비슷한 경험을 찾아줍니다. (로컬 임베딩)</p>
      <form className="search-box" onSubmit={(e) => { e.preventDefault(); run() }}>
        <input
          autoFocus
          placeholder="예: 문제를 해결한 경험"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="el-btn" disabled={loading}>{loading ? '검색 중…' : '검색'}</button>
      </form>
      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="chip" onClick={() => run(ex)}>{ex}</button>
        ))}
      </div>

      {!hasExperiences && (
        <div className="onboard-banner">
          <p>아직 등록된 경험이 없어요. 먼저 경험을 등록해야 검색할 내용이 생깁니다.</p>
          <div className="actions">
            <Link to="/experiences/new" className="el-btn">+ 새 경험</Link>
            <Link to="/chat" className="el-ghost">대화로 정리</Link>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {results && (
        <div className="results">
          <div className="el-muted">상위 {results.length}개 결과</div>
          {results.length === 0 && <p>등록된 경험이 없습니다. 먼저 경험을 추가하세요.</p>}
          {results.map((r, i) => (
            <Link to={`/experiences/${r.id}`} key={r.id} className="result-card">
              <div className="result-head">
                <span className="rank">#{i + 1}</span>
                <span className="result-title">{r.title}</span>
                <span className="score">{(r.score * 100).toFixed(1)}%</span>
              </div>
              {r.problem && <p><b>Problem</b> · {r.problem}</p>}
              {r.action && <p><b>Action</b> · {r.action}</p>}
              {r.result && <p><b>Result</b> · {r.result}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
