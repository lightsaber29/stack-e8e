// 대화형 경험 입력. 대화로 정리한 결과(draft)를 기존 등록 폼에 채워서 보여주고,
// 사용자가 확인·수정한 뒤에 저장한다 (PROJECT.md "대화형 경험 입력").
import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ExperienceFields, { toApi, fromApi } from '../components/ExperienceFields.jsx'
import TagList from '../components/TagList.jsx'
import Modal from '../components/Modal.jsx'
import { chat, chatUpload, createExperience, updateExperience, getExperience } from '../api'

const HINT = '예: "작년에 결제 API가 3초씩 걸려서 느리다는 얘기가 나왔어. 인덱스를 새로 걸어서 0.4초로 줄였고..."'
const HINT_EDIT = '예: "결과 부분에 응답 시간을 0.4초로 줄였다고 추가해줘"'
const KICKOFF = '지금 등록된 내용을 검토하고, 비어있거나 모호한 부분을 짚어서 질문해줘.'

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const SECTIONS = [['situation', 'Situation'], ['problem', 'Problem'], ['action', 'Action'], ['result', 'Result']]

export default function Chat() {
  const { id: editId } = useParams()          // 있으면 "기존 경험을 대화로 수정" 모드
  const [existingExp, setExistingExp] = useState(null) // 좌측에 보여줄, 수정 대상의 저장된 원본
  const [log, setLog] = useState([])          // { role: 'user'|'agent', text }
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(null)    // 확인 대기 중인 정리 결과
  const [saving, setSaving] = useState(false)
  const [uploads, setUploads] = useState([])  // 파일 업로드로 뽑아낸 경험들 [{data, saving, savedId, error}]
  const [uploadBusy, setUploadBusy] = useState(false)
  const navigate = useNavigate()
  const end = useRef(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const kickedOff = useRef(false)

  useEffect(() => {
    if (!editId) return
    getExperience(editId).then(setExistingExp).catch((e) => setError(e.message))
  }, [editId])

  // 편집 모드로 들어오면 사용자 입력 없이 첫 턴을 쏴서 클로드가 먼저 기존 내용을 검토·질문하게 한다.
  useEffect(() => {
    if (!editId || kickedOff.current) return
    kickedOff.current = true
    runTurn(KICKOFF, { showUser: false })
  }, [editId])

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [log, busy])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const style = getComputedStyle(el)
    const maxHeight = parseFloat(style.lineHeight) * 3
      + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
    el.style.height = 'auto'
    const needed = el.scrollHeight
    const capped = Math.min(needed, Math.ceil(maxHeight))
    el.style.height = `${capped}px`
    el.style.overflowY = needed > capped ? 'auto' : 'hidden'
  }, [input])

  async function runTurn(text, { showUser }) {
    setError('')
    if (showUser) setLog((l) => [...l, { role: 'user', text }])
    setBusy(true)
    try {
      const res = await chat(text, sessionId, editId)
      setSessionId(res.sessionId)
      if (res.reply) setLog((l) => [...l, { role: 'agent', text: res.reply }])
      if (res.draft) setDraft(fromApi(res.draft))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function send(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    runTurn(text, { showUser: true })
  }

  async function save() {
    if (!draft.title?.trim()) { setError('제목은 필수입니다.'); return }
    setSaving(true)
    setError('')
    try {
      const saved = editId ? await updateExperience(editId, toApi(draft)) : await createExperience(toApi(draft))
      navigate(`/experiences/${saved.id}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setUploadBusy(true)
    try {
      const contentBase64 = await readAsBase64(file)
      const res = await chatUpload(file.name, contentBase64)
      const found = (res.drafts || []).map((d) => ({ data: fromApi(d), saving: false, savedId: null, error: '' }))
      if (found.length === 0) setError('파일에서 경험을 찾지 못했습니다.')
      setUploads((u) => [...u, ...found])
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadBusy(false)
    }
  }

  function updateUpload(i, data) {
    setUploads((u) => u.map((item, idx) => (idx === i ? { ...item, data } : item)))
  }

  async function saveUpload(i) {
    const item = uploads[i]
    if (!item.data.title?.trim()) {
      setUploads((u) => u.map((it, idx) => (idx === i ? { ...it, error: '제목은 필수입니다.' } : it)))
      return
    }
    setUploads((u) => u.map((it, idx) => (idx === i ? { ...it, saving: true, error: '' } : it)))
    try {
      const created = await createExperience(toApi(item.data))
      setUploads((u) => u.map((it, idx) => (idx === i ? { ...it, saving: false, savedId: created.id } : it)))
    } catch (err) {
      setUploads((u) => u.map((it, idx) => (idx === i ? { ...it, saving: false, error: err.message } : it)))
    }
  }

  function dismissUpload(i) {
    setUploads((u) => u.filter((_, idx) => idx !== i))
  }

  return (
    <div className="editorial-page">
      <h1>{editId ? '대화로 경험 수정' : '대화로 경험 정리'}</h1>
      <p className="el-muted">
        {editId
          ? '왼쪽은 지금 저장된 내용입니다. 대화로 언급하지 않은 내용은 그대로 유지됩니다.'
          : '기억나는 대로 이야기하면 Situation / Problem / Action / Result 로 정리해 줍니다.'}
        {' '}정리 결과는 확인·수정한 뒤에 저장됩니다.
      </p>

      <div className={editId ? 'chat-edit-grid' : undefined}>
        {editId && (
          <aside className="chat-existing">
            <h3 className="panel-title">현재 저장된 내용</h3>
            {!existingExp ? <p className="el-muted small">불러오는 중…</p> : (
              <>
                <p className="el-muted small">
                  {[existingExp.company, existingExp.project, existingExp.period].filter(Boolean).join(' · ')}
                </p>
                {SECTIONS.map(([k, label]) => existingExp[k] && (
                  <section key={k}><h3>{label}</h3><p className="pre small">{existingExp[k]}</p></section>
                ))}
                {['technologies', 'roles', 'keywords', 'metrics'].map((k) => (
                  <TagList key={k} tags={existingExp[k]} />
                ))}
              </>
            )}
          </aside>
        )}

        <div className="chat-conversation">
          <div className="chat-log">
            {log.length === 0 && <p className="el-muted small">{editId ? HINT_EDIT : HINT}</p>}
            {log.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.text}</div>)}
            {busy && <div className="bubble agent el-muted">정리하는 중…</div>}
            <div ref={end} />
          </div>

          <form className="search-box chat-input-box" onSubmit={send}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) send(e)
              }}
              placeholder={draft ? '더 고칠 내용이 있으면 말해 주세요' : '경험을 이야기해 보세요'}
              disabled={busy}
            />
            <button className="el-btn" disabled={busy || !input.trim()}>보내기</button>
          </form>

          {error && <p className="error">{error}</p>}

          {draft && (
            <Modal onClose={() => setDraft(null)}>
              <h3 className="panel-title">정리 결과 — 확인 후 저장</h3>
              <p className="el-muted small">틀린 부분은 직접 고칠 수 있습니다. 저장하면 로컬 임베딩이 생성됩니다.</p>
              <ExperienceFields value={draft} onChange={setDraft} />
              <div className="actions">
                <button className="el-btn" onClick={save} disabled={saving}>
                  {saving ? '저장 중… (임베딩 생성)' : '저장'}
                </button>
                <button type="button" className="el-ghost" onClick={() => setDraft(null)} disabled={saving}>
                  계속 대화하기
                </button>
              </div>
            </Modal>
          )}
        </div>
      </div>

      {!editId && (
        <div className="upload-box">
          <input ref={fileRef} type="file" accept=".md,.txt,.pdf" onChange={handleFile} hidden />
          <button type="button" className="el-ghost" onClick={() => fileRef.current?.click()} disabled={uploadBusy}>
            {uploadBusy ? '파일 분석 중…' : '경력 문서 업로드 (md/pdf)'}
          </button>
          <p className="el-muted small">파일 하나에 경험이 여러 개면 자동으로 나눠서 목록으로 보여줍니다.</p>
        </div>
      )}

      {uploads.length > 0 && (
        <section className="draft">
          <h3 className="panel-title">업로드에서 찾은 경험 {uploads.length}개</h3>
          <p className="el-muted small">각각 확인·수정 후 개별적으로 저장하세요.</p>
          {uploads.map((item, i) => (
            <div key={i} className="upload-item">
              {item.savedId ? (
                <p className="el-muted">저장됨 — <a href={`#/experiences/${item.savedId}`} onClick={(e) => { e.preventDefault(); navigate(`/experiences/${item.savedId}`) }}>보기</a></p>
              ) : (
                <>
                  <ExperienceFields value={item.data} onChange={(d) => updateUpload(i, d)} />
                  {item.error && <p className="error">{item.error}</p>}
                  <div className="actions">
                    <button className="el-btn" onClick={() => saveUpload(i)} disabled={item.saving}>
                      {item.saving ? '저장 중…' : '저장'}
                    </button>
                    <button type="button" className="el-ghost" onClick={() => dismissUpload(i)} disabled={item.saving}>
                      제외
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
