const PASTELS = ['tag-red', 'tag-blue', 'tag-green', 'tag-yellow']

export default function TagList({ tags }) {
  if (!tags?.length) return null
  return (
    <div className="el-tags">
      {tags.map((v, i) => <span key={v} className={`el-tag ${PASTELS[i % PASTELS.length]}`}>{v}</span>)}
    </div>
  )
}
