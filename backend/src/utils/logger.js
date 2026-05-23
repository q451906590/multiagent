function fmt(level, args) {
  const ts = new Date().toISOString()
  return [`[${ts}] [${level}]`, ...args]
}

export const logger = {
  info: (...args) => console.log(...fmt('info', args)),
  warn: (...args) => console.warn(...fmt('warn', args)),
  error: (...args) => console.error(...fmt('error', args)),
  debug: (...args) => {
    if (process.env.DEBUG) console.log(...fmt('debug', args))
  },
}
