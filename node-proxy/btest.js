import Rc4 from './utils/rc4.js'
import { httpClient } from './utils/httpClient.js'

import { XMLParser } from 'fast-xml-parser'

const startTime = Date.now()
console.log('@@@PRGAExcute-strat', Date.now())
// 初始化目录
const size = 123456
console.log(process.env)

const request = {
  method: 'PROPFIND',
  headers: {
    depth: 1,
    authorization: 'Basic YWRtaW46WWl1Tkg3bHk=',
  },
  urlAddr: 'http://192.168.8.240:5244/dav/aliyun/test4',
}
const parser = new XMLParser({ removeNSPrefix: true })

httpClient(request).then((XMLdata) => {
  let jObj = parser.parse(XMLdata)
  console.log(jObj.multistatus.response[1].propstat)
})
