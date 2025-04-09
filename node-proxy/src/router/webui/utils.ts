import type { webui } from '@/@types/webui'

export type RawPasswdInfo = ModifyPropType<PasswdInfo, 'encPath', string | string[]>

//将文件目录字符串转化为列表
export const splitEncPath = (raw: RawPasswdInfo): PasswdInfo => {
  return {
    ...raw,
    encPath: Array.isArray(raw.encPath) ? raw.encPath : raw.encPath.split(','),
  }
}

//构造webui返回响应的body
export const response = (raw: Partial<webui.ResponseBody>): webui.ResponseBody => {
  const { flag, msg, code, data } = raw
  return { flag: flag || true, msg, code: code || 200, data }
}
