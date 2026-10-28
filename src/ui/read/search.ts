/** Split a message into plain and highlighted parts for the current search; used by the table rows. */
export type Part = { text: string; hit: boolean }

export function makeHighlighter(pattern: string, regex: boolean, caseSensitive: boolean): ((s: string) => Part[]) | null {
  if (!pattern) return null
  let re: RegExp
  try {
    re = regex ? new RegExp(pattern, caseSensitive ? 'g' : 'gi') : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
  return (s: string) => {
    const parts: Part[] = []
    let last = 0
    re.lastIndex = 0
    let m: RegExpExecArray | null
    let guard = 0
    while ((m = re.exec(s)) !== null && guard++ < 200) {
      if (m[0] === '') {
        re.lastIndex++
        continue
      }
      if (m.index > last) parts.push({ text: s.slice(last, m.index), hit: false })
      parts.push({ text: m[0], hit: true })
      last = m.index + m[0].length
    }
    if (last < s.length) parts.push({ text: s.slice(last), hit: false })
    return parts.length ? parts : [{ text: s, hit: false }]
  }
}
