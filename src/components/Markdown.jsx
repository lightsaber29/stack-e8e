import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/* 경험 본문(S/P/A/R, 원본 메모)은 Obsidian 노트에서 온 마크다운이다.
   표·강조·인용구·코드가 그대로 문자로 보이지 않도록 렌더링한다.
   react-markdown 은 raw HTML 을 렌더링하지 않으므로(rehype-raw 미사용)
   노트에 섞인 `<!-- career-memory-id: ... -->` 같은 주석도 그대로 무시된다. */
const COMPONENTS = {
  // 표는 좁은 화면에서 페이지를 밀지 않도록 자기 안에서 가로 스크롤한다.
  table: (props) => <div className="md-table-wrap"><table {...props} /></div>,
  a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
}

export default function Markdown({ children, className = '' }) {
  if (!children) return null
  return (
    <div className={['md', className].filter(Boolean).join(' ')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>{children}</ReactMarkdown>
    </div>
  )
}
