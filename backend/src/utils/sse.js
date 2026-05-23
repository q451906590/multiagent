export function openSse(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  let closed = false
  res.on('close', () => {
    closed = true
  })

  function send(event, data) {
    if (closed) return false
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    const lines = payload.split(/\r?\n/).map((l) => `data: ${l}`).join('\n')
    res.write(`event: ${event}\n${lines}\n\n`)
    return true
  }

  function comment(text) {
    if (closed) return
    res.write(`: ${text}\n\n`)
  }

  function close() {
    if (closed) return
    closed = true
    try { res.end() } catch (_) { /* noop */ }
  }

  return {
    send,
    comment,
    close,
    get closed() { return closed },
  }
}
