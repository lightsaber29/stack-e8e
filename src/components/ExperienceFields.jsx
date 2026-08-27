// 등록/수정 공용 입력 필드. docs/experience-schema.md 의 필드 구성을 따른다.
const TEXT = [
  ['company', '회사'], ['project', '프로젝트'], ['period', '기간 (예: 2022.03 - 2022.09)'],
]
const AREA = [
  ['situation', 'Situation (상황)'], ['problem', 'Problem (문제)'],
  ['action', 'Action (행동)'], ['result', 'Result (결과)'],
]
const LIST = [
  ['technologies', '기술 (쉼표로 구분)'], ['roles', '역할 (쉼표로 구분)'],
  ['keywords', '키워드 (쉼표로 구분)'], ['metrics', '성과 지표 (쉼표로 구분)'],
]

export const LIST_FIELDS = LIST.map(([k]) => k)

export default function ExperienceFields({ value, onChange }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className="form">
      <section className="form-section">
        <h3 className="panel-title">기본 정보</h3>
        <label className="full">
          <span>제목 *</span>
          <input value={value.title || ''} onChange={set('title')} placeholder="예: 고객정보 브라우저 저장 방식 개선" />
        </label>
        <div className="grid3">
          {TEXT.map(([k, label]) => (
            <label key={k}><span>{label}</span><input value={value[k] || ''} onChange={set(k)} /></label>
          ))}
        </div>
      </section>

      <section className="form-section">
        <h3 className="panel-title">S-P-A-R</h3>
        {AREA.map(([k, label]) => (
          <label key={k} className="full"><span>{label}</span><textarea rows={2} value={value[k] || ''} onChange={set(k)} /></label>
        ))}
      </section>

      <section className="form-section">
        <h3 className="panel-title">메타데이터</h3>
        <div className="grid2">
          {LIST.map(([k, label]) => (
            <label key={k}><span>{label}</span><input value={value[k] || ''} onChange={set(k)} /></label>
          ))}
        </div>
      </section>

      <section className="form-section">
        <h3 className="panel-title">원본 메모</h3>
        <label className="full"><span>원본 메모</span><textarea rows={2} value={value.rawMemo || ''} onChange={set('rawMemo')} /></label>
      </section>
    </div>
  )
}

// UI(문자열) <-> API(배열) 변환
export function toApi(form) {
  const out = { ...form }
  for (const k of LIST_FIELDS) {
    out[k] = (form[k] || '').split(',').map((s) => s.trim()).filter(Boolean)
  }
  return out
}
export function fromApi(exp) {
  const out = { ...exp }
  for (const k of LIST_FIELDS) out[k] = Array.isArray(exp[k]) ? exp[k].join(', ') : ''
  return out
}
