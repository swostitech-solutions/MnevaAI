import winston from 'winston'
const { combine, timestamp, printf, colorize } = winston.format
const fmt = printf(({ level, message, timestamp }) => `${timestamp} [${level}] ${message}`)
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp({ format: 'HH:mm:ss' }), fmt),
  transports: [
    new winston.transports.Console({ format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), fmt) }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/app.log' })
  ]
})
