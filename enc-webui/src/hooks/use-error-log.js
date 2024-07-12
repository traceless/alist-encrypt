/*js 错误日志收集*/
import { jsErrorCollection } from 'js-error-collection'
import pack from '../../package.json'
import settings from '@/settings'
import bus from '@/utils/bus'
import axiosReq from 'axios'
const reqUrl = '/integration-front/errorCollection/insert'
let repeatErrorLogJudge = ''

const errorLogReq = (errLog) => {
  axiosReq({
    url: import.meta.env.VITE_APP_BASE_URL + reqUrl,
    data: {
      pageUrl: window.location.href,
      errorLog: errLog,
      browserType: navigator.userAgent,
      version: pack.version
    },
    method: 'post'
  }).then(() => {
    //通知错误列表页面更新数据
    bus.emit('reloadErrorPage', {})
  })
}

export const useErrorLog = () => {
  //判断该环境是否需要收集错误日志,由settings配置决定
  if (settings.errorLog?.includes(import.meta.env.VITE_APP_ENV)) {
    jsErrorCollection({ runtimeError: true, rejectError: true, consoleError: true }, (errLog) => {
      if (!repeatErrorLogJudge || !errLog.includes(repeatErrorLogJudge)) {
        errorLogReq(errLog)
        //移除重复日志，fix重复提交错误日志，避免造成死循环
        repeatErrorLogJudge = errLog.slice(0, 20)
      }
    })
  }
}
