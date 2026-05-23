import { apiFetch } from './http.js'

function parseSseBlock(block) {
  const events = []
  let event = 'message'
  const dataLines = []
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (line === '') continue
    if (line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }
  if (dataLines.length > 0) events.push({ event, data: dataLines.join('\n') })
  return events
}

export async function sendMessage({ agent, content, uploadedFiles, onDelta, signal }) {
  const body = { content }
  if (Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
    body.uploadedFiles = uploadedFiles
  }
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agent.id)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch (_) { /* noop */ }
    throw new Error(msg)
  }
  if (!res.body) throw new Error('streaming not supported by this browser')

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let acc = ''
  let lastError = null

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sepIndex
      while ((sepIndex = buffer.indexOf('\n\n')) >= 0 || (sepIndex = buffer.indexOf('\r\n\r\n')) >= 0) {
        const isCrlf = buffer.slice(sepIndex, sepIndex + 4) === '\r\n\r\n'
        const block = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + (isCrlf ? 4 : 2))

        for (const ev of parseSseBlock(block)) {
          if (ev.event === 'delta') {
            try {
              const j = JSON.parse(ev.data)
              if (typeof j.acc === 'string') {
                acc = j.acc
              } else if (typeof j.chunk === 'string') {
                acc += j.chunk
              }
              const chunk = typeof j.chunk === 'string' ? j.chunk : ''
              onDelta?.(chunk, acc)
            } catch (_) {
              acc += ev.data
              onDelta?.(ev.data, acc)
            }
          } else if (ev.event === 'done') {
            try {
              const j = JSON.parse(ev.data)
              if (typeof j.content === 'string' && j.content) {
                acc = j.content
                onDelta?.('', acc)
              }
            } catch (_) { /* noop */ }
          } else if (ev.event === 'error') {
            try {
              const j = JSON.parse(ev.data)
              lastError = new Error(j?.message || 'chat error')
            } catch (_) {
              lastError = new Error(ev.data || 'chat error')
            }
          }
        }
      }
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw err
  }

  if (lastError) throw lastError
  return acc
}
