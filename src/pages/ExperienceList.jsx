import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import TagList from '../components/TagList.jsx'
import Modal from '../components/Modal.jsx'
import { listExperiences, syncVault, exportVaultNotes, importSources } from '../api'

// 소재 문서 가져오기: Sources 폴더의 원본 문서에서 경험을 뽑아 DB + 경험 노트로 만든다.
// 원본은 읽기만 하므로 "이미 가져온 것"은 볼트 숨김 파일 기록으로 판단한다 (backend/sources.mjs).
function ImportModal({ plan, onClose, onApply, applying }) {
  const done = plan.applied
  const creates = done ? plan.details.creates : plan.creates
  const already = done ? plan.already : plan.already.length
  const warnings = done ? [] : plan.creates.filter((c) => c.warnings?.length)

  return (
    <Modal onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>{done ? '소재 문서 가져오기 완료' : '소재 문서 가져오기'}</h3>
      <p className="el-muted small" style={{ marginTop: -8 }}>
        {done
          ? '원본 문서는 그대로 두고, 경험 노트를 Experiences 에 만들었습니다.'
          : '원본 문서는 수정하지 않습니다. 한 번 가져온 대목은 다시 가져오지 않습니다.'}
      </p>
      {plan.sourcesDir && <p className="el-muted small">폴더: <code>{plan.sourcesDir}</code></p>}

      <div className="sync-counts">
        <span>{done ? '가져옴' : '가져올 것'} <b>{done ? plan.imported : creates.length}</b></span>
        {done && <span>분류 채움 <b>{plan.classified}</b></span>}
        <span>이미 가져옴 <b>{already}</b></span>
      </div>

      {!!creates.length && (
        <div className="form-section">
          <h4>{done ? '가져온 경험' : '가져올 경험'}</h4>
          <ul className="sync-list">
            {creates.map((c) => (
              <li key={c.id}>
                {c.title}
                <span className="el-muted small">{c.filled?.length ? ` [${c.filled.join(', ')}]` : ` ← ${c.source}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!warnings.length && (
        <div className="form-section">
          <h4>경고</h4>
          <ul className="sync-list">{warnings.map((w) => <li key={w.id}>{w.source}: {w.warnings.join(' / ')}</li>)}</ul>
        </div>
      )}
      {!!plan.notices?.length && (
        <ul className="sync-list el-muted small">{plan.notices.map((n) => <li key={n}>{n}</li>)}</ul>
      )}
      {!!plan.errors?.length && (
        <div className="form-section">
          <h4 style={{ color: '#b42318' }}>오류</h4>
          <ul className="sync-list">{plan.errors.map((e, i) => <li key={i}>{e.source}: {e.reason}</li>)}</ul>
        </div>
      )}
      {!done && !creates.length && <p className="el-muted">새로 가져올 경험이 없습니다.</p>}

      <div className="actions sync-actions">
        <button type="button" className="el-ghost" onClick={onClose}>{done ? '닫기' : '취소'}</button>
        {!done && !!creates.length && (
          <button type="button" className="el-btn" onClick={onApply} disabled={applying}>
            {applying ? '가져오는 중… (분류 + 임베딩, 오래 걸립니다)' : `${creates.length}건 가져오기`}
          </button>
        )}
      </div>
    </Modal>
  )
}

// 볼트 동기화는 두 단계다: 먼저 미리보기(계획)를 받아 보여주고, 사용자가 확인한 뒤에만 적용한다.
// 삭제는 한 단계 더 — 체크박스로 동의해야 반영한다(볼트에 노트가 없는 경험까지 지우기 때문).
function SyncModal({ plan, onClose, onApply, onExport, applying, exporting, confirmDelete, setConfirmDelete }) {
  const done = plan.applied
  const rows = done
    ? [
        ['신규', plan.created],
        ['갱신', plan.updated],
        ['삭제', plan.deleted],
        ['변경 없음', plan.unchanged],
      ]
    : [
        ['신규', plan.creates.length],
        ['갱신', plan.updates.length],
        ['삭제', plan.deletes.length],
        ['변경 없음', plan.unchanged.length],
      ]
  const creates = done ? plan.details.creates : plan.creates
  const updates = done ? plan.details.updates : plan.updates
  const deletes = done ? plan.details.deletes : plan.deletes
  const warnings = [...creates, ...updates].filter((x) => x.warnings?.length)
  const nothingToDo = !done && !creates.length && !updates.length && !deletes.length

  return (
    <Modal onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>{done ? '볼트 동기화 완료' : '볼트 동기화 미리보기'}</h3>
      <p className="el-muted small" style={{ marginTop: -8 }}>
        {done ? 'DB 에 반영했습니다.' : 'stack-e8e-vault/Experiences 의 .md 를 기준으로 DB 를 맞춥니다. 아직 반영하지 않았습니다.'}
      </p>

      <div className="sync-counts">
        {rows.map(([label, n]) => (
          <span key={label}>{label} <b>{n}</b></span>
        ))}
      </div>

      {!!creates.length && (
        <div className="form-section">
          <h4>신규{done ? '' : ' 예정'}</h4>
          <ul className="sync-list">{creates.map((c) => <li key={c.id}>{c.title} <span className="el-muted small">({c.source})</span></li>)}</ul>
        </div>
      )}
      {!!updates.length && (
        <div className="form-section">
          <h4>갱신{done ? '' : ' 예정'}</h4>
          <ul className="sync-list">{updates.map((u) => <li key={u.id}>{u.title} <span className="el-muted small">— {u.fields.join(', ')}</span></li>)}</ul>
        </div>
      )}
      {!!deletes.length && (
        <div className="form-section">
          <h4 style={{ color: '#b42318' }}>{done ? '삭제됨' : '볼트에 노트가 없는 경험'}</h4>
          <ul className="sync-list">{deletes.map((d) => <li key={d.id}>{d.title}</li>)}</ul>
          {!done && (
            <>
              <label className="sync-confirm">
                <input
                  type="checkbox"
                  checked={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.checked)}
                />
                <span>이 {deletes.length}건을 DB 에서도 삭제합니다</span>
              </label>
              <button type="button" className="el-ghost" onClick={onExport} disabled={exporting}>
                {exporting ? '내보내는 중…' : '지우지 않고 볼트로 내보내기'}
              </button>
            </>
          )}
        </div>
      )}
      {!!warnings.length && (
        <div className="form-section">
          <h4>경고</h4>
          <ul className="sync-list">{warnings.map((w) => <li key={w.source}>{w.source}: {w.warnings.join(' / ')}</li>)}</ul>
        </div>
      )}
      {!!plan.notices?.length && (
        <ul className="sync-list el-muted small">{plan.notices.map((n) => <li key={n}>{n}</li>)}</ul>
      )}
      {!!plan.errors?.length && (
        <div className="form-section">
          <h4 style={{ color: '#b42318' }}>오류</h4>
          <ul className="sync-list">{plan.errors.map((e, i) => <li key={i}>{e.source || e.id}: {e.reason}</li>)}</ul>
        </div>
      )}
      {nothingToDo && <p className="el-muted">반영할 변경이 없습니다.</p>}

      <div className="actions sync-actions">
        <button type="button" className="el-ghost" onClick={onClose}>{done ? '닫기' : '취소'}</button>
        {!done && !nothingToDo && (
          <button type="button" className="el-btn" onClick={onApply} disabled={applying}>
            {applying ? '반영 중…' : '반영하기'}
          </button>
        )}
      </div>
    </Modal>
  )
}

export default function ExperienceList() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [importPlan, setImportPlan] = useState(null)
  const [importing, setImporting] = useState(false)
  const [applyingImport, setApplyingImport] = useState(false)

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

  async function preview() {
    setError('')
    setConfirmDelete(false)
    setSyncing(true)
    try {
      setPlan(await syncVault(false))
    } catch (e) {
      setError(e.message)
    } finally {
      setSyncing(false)
    }
  }

  async function apply() {
    setApplying(true)
    try {
      setPlan(await syncVault(true, confirmDelete))
      await reload()
    } catch (e) {
      setError(e.message)
      setPlan(null)
    } finally {
      setApplying(false)
    }
  }

  // 삭제 대상을 지우지 않고 볼트로 꺼낸다. 내보낸 뒤에는 삭제 대상이 사라지므로 계획을 다시 받는다.
  async function exportMissing() {
    setExporting(true)
    try {
      await exportVaultNotes()
      setPlan(await syncVault(false))
      setConfirmDelete(false)
    } catch (e) {
      setError(e.message)
      setPlan(null)
    } finally {
      setExporting(false)
    }
  }

  async function previewImportPlan() {
    setError('')
    setImporting(true)
    try {
      setImportPlan(await importSources(false))
    } catch (e) {
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  async function runImport() {
    setApplyingImport(true)
    try {
      setImportPlan(await importSources(true))
      await reload()
    } catch (e) {
      setError(e.message)
      setImportPlan(null)
    } finally {
      setApplyingImport(false)
    }
  }

  return (
    <div className="editorial-page">
      <div className="list-head">
        <h1>경험 목록 <span className="el-muted">({items.length})</span></h1>
        <div className="list-head-actions">
          <button type="button" className="el-ghost" onClick={previewImportPlan} disabled={importing}>
            {importing ? '읽는 중…' : '소재 문서 가져오기'}
          </button>
          <button type="button" className="el-ghost" onClick={preview} disabled={syncing}>
            {syncing ? '확인 중…' : '볼트 동기화'}
          </button>
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
      {plan && (
        <SyncModal
          plan={plan}
          applying={applying}
          exporting={exporting}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          onClose={() => setPlan(null)}
          onApply={apply}
          onExport={exportMissing}
        />
      )}
      {importPlan && (
        <ImportModal
          plan={importPlan}
          applying={applyingImport}
          onClose={() => setImportPlan(null)}
          onApply={runImport}
        />
      )}
    </div>
  )
}
