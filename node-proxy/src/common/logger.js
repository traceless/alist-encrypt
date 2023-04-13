import log4js from 'log4js'
import dotenv from 'dotenv'
dotenv.config('./env')

log4js.configure({
  appenders: {
    console: { type: 'console' },
    fileLogs: { type: 'file', filename: process.cwd() + '/logs/server.log', category: 'cheese' },
    err: { type: 'stderr' },
  },
  categories: {
    debug: { appenders: ['console'], level: 'debug' },
    default: { appenders: ['console', 'fileLogs'], level: 'info' },
  },
})

const category = process.env.RUN_MODE === 'DEV' ? 'debug' : 'default'
export const logger = log4js.getLogger(category)
