import 'katex/dist/katex.min.css'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

/** Notes rendered with Markdown, checklists, tables and LaTeX formulas ($…$ and $$…$$). */
export default function Markdown({ children }: { children: string }) {
  // a line that is just $$…$$ is meant as a centered formula, not inline math
  const source = children.replace(/^[ \t]*\$\$(.+?)\$\$[ \t]*$/gm, (_, tex: string) => `$$\n${tex}\n$$`)
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
