'use strict'

import { pathFindPasswd, convertRealName, convertShowName } from './utils/commonUtil'
import { cacheFileInfo, getFileInfo } from './dao/fileDao'
import { logger } from './common/logger'
import path from 'path'
import { httpClient, httpProxy } from './utils/httpClient'
import { XMLParser } from 'fast-xml-parser'
import FlowEnc from '@/utils/flowEnc'
import { getWebdavFileInfo } from '@/utils/webdavClient'

async function sleep(time) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, time || 3000)
  })
}
const origPrefix = 'orig_'
// bodyparser解析body
const parser = new XMLParser({ removeNSPrefix: true })

function getFileNameForShow(fileInfo, passwdInfo) {
  let getcontentlength = -1
  const href = fileInfo.href
  const fileName = path.basename(href)
  if (fileInfo.propstat instanceof Array) {
    getcontentlength = fileInfo.propstat[0].prop.getcontentlength
  } else if (fileInfo.propstat.prop) {
    getcontentlength = fileInfo.propstat.prop.getcontentlength
  }
  // logger.debug('@@fileInfo_show', JSON.stringify(fileInfo))
  // is not dir
  if (getcontentlength !== undefined && getcontentlength > -1) {
    const showName = convertShowName(passwdInfo.password, passwdInfo.encType, decodeURI(href))
    return { fileName, showName }
  }
  // cache this folder info
  return {}
}

function cacheWebdavFileInfo(fileInfo) {
  let getcontentlength = -1
  const href = fileInfo.href
  const fileName = path.basename(href)
  if (fileInfo.propstat instanceof Array) {
    getcontentlength = fileInfo.propstat[0].prop.getcontentlength
  } else if (fileInfo.propstat.prop) {
    getcontentlength = fileInfo.propstat.prop.getcontentlength
  }
  logger.info('@@cacheWebdavFileInfo', decodeURI(href), fileName)
  // it is a file
  if (getcontentlength !== undefined && getcontentlength > -1) {
    const fileDetail = { path: href, name: fileName, is_dir: false, size: getcontentlength }
    cacheFileInfo(fileDetail, true)
    return fileDetail
  }
  // cache this folder info
  const fileDetail = { path: href, name: fileName, is_dir: true, size: 0 }
  cacheFileInfo(fileDetail, true)
  return fileDetail
}

// 拦截webdav，预处理request
const preHandle = async (ctx, next) => {
  const request = ctx.req
  const response = ctx.res
  const { passwdList } = request.webdavConfig
  const { passwdInfo } = pathFindPasswd(passwdList, decodeURI(request.url))
  // 创建目录
  if (ctx.method.toLocaleUpperCase() === 'MKCOL' && passwdInfo && passwdInfo.encName) {
    // 对名字进行加密, TODO
    logger.info('@@method MKCOL', request.body, request.url)
    return await httpProxy(ctx.req, ctx.res)
  }
  // 列表查询或者文件信息查询，把返回来的名字进行加密
  if (ctx.method.toLocaleUpperCase() === 'PROPFIND' && passwdInfo && passwdInfo.encName) {
    // check dir, convert url
    const url = request.url
    if (passwdInfo && passwdInfo.encName) {
      // check dir, convert url
      const reqFileName = path.basename(url)
      // cache source file info, realName has execute encodeUrl()，this '(' '+' can't encodeUrl.
      const realName = convertRealName(passwdInfo.password, passwdInfo.encType, decodeURI(url))
      // when the name contain the + , ! ,
      const sourceUrl = decodeURI(path.dirname(url)) + '/' + realName
      const sourceFileInfo = await getFileInfo(sourceUrl)
      logger.debug('@@@sourceFileInfo', sourceFileInfo, reqFileName, realName, url, sourceUrl)
      // it is file, convert file name
      if (sourceFileInfo && !sourceFileInfo.is_dir) {
        request.url = path.dirname(request.url) + '/' + encodeURI(realName)
        request.urlAddr = path.dirname(request.urlAddr) + '/' + encodeURI(realName)
      }
    }
    // decrypt file name
    let respBody = await httpClient(ctx.req, ctx.res)
    const respData = parser.parse(respBody)
    // convert file name for show
    if (respData.multistatus) {
      const respJson = respData.multistatus.response
      // 这里是获取到列表，文件夹和文件
      if (respJson instanceof Array) {
        // logger.info('@@respJsonArray', respJson)
        respJson.forEach((fileInfo) => {
          // logger.info('@@webdav fileInfo ', fileInfo)
          // cache real file info，include forder name
          cacheWebdavFileInfo(fileInfo)
          if (passwdInfo && passwdInfo.encName) {
            const { fileName, showName } = getFileNameForShow(fileInfo, passwdInfo)
            // logger.debug('@@getFileNameForShow1 list', passwdInfo.password, fileName, decodeURI(fileName), showName)
            if (fileName) {
              const showXmlName = showName.replace(/&/g, '&amp;').replace(/</g, '&gt;')
              // 群晖的展示的名字是hrefName，ES文件夹展示的名字是displayname ，各种坑爹客户端
              const displayname = decodeURI(fileName).replace(/&/g, '&amp;').replace(/</g, '&gt;')
              const hrefName = fileName.replace(/&/g, '&amp;').replace(/</g, '&gt;')
              respBody = respBody.replace(`${hrefName}</D:href>`, `${encodeURI(showXmlName)}</D:href>`)
              respBody = respBody.replace(`${displayname}</D:displayname>`, `${showXmlName}</D:displayname>`)
            }
          }
        })
        // waiting cacheWebdavFileInfo a moment
        await sleep(50)
      } else if (passwdInfo && passwdInfo.encName) {
        // 这里PROPFIND请求的是文件信息，上面得到是列表后，客户端还会继续请求每个文件的信息。。。
        const fileInfo = respJson
        // showName已经是decodeUrl处理过了
        const { fileName, showName } = getFileNameForShow(fileInfo, passwdInfo)
        // logger.debug('@@getFileNameForShow2 file', fileName, showName, url, respJson.propstat)
        if (fileName) {
          const showXmlName = showName.replace(/&/g, '&amp;').replace(/</g, '&gt;')
          const displayname = decodeURI(fileName).replace(/&/g, '&amp;').replace(/</g, '&gt;')
          const hrefName = fileName.replace(/&/g, '&amp;').replace(/</g, '&gt;')
          respBody = respBody.replace(`${hrefName}</D:href>`, `${encodeURI(showXmlName)}</D:href>`)
          respBody = respBody.replace(`${displayname}</D:displayname>`, `${showXmlName}</D:displayname>`)
        }
      }
    }
    // 检查数据兼容的问题，优先XML对比。
    // logger.debug('@@respJsxml', respBody, ctx.headers)
    // const resultBody = parser.parse(respBody)
    // logger.debug('@@respJSONData2', ctx.res.statusCode, JSON.stringify(resultBody))

    // 而rclone遇到404只能使用 ctx.res.end(respBody)，这里有待验证
    if (ctx.res.statusCode === 404) {
      // fix rclone propfind 404 ，because rclone copy will get error 501
      ctx.respond = false
      ctx.res.end(respBody)
      return
    }
    // 因为ctx.body 会重新计算响应的Content-length，此时respBody发生了变化，需要调整header的长度
    ctx.status = ctx.res.statusCode
    ctx.body = respBody
    return
  }

  // 相同密码目录则加密平移，否则destName按原来明文名字存到新路径，orig_这个也会恢复原明文
  if ('COPY,MOVE'.includes(request.method.toLocaleUpperCase())) {
    if (passwdInfo && passwdInfo.encName) {
      const showName = path.basename(decodeURI(request.url))
      const realName = convertRealName(passwdInfo.password, passwdInfo.encType, decodeURI(request.url))
      // 直接获取用户名
      request.url = path.dirname(request.url) + '/' + encodeURI(realName)
      request.urlAddr = path.dirname(request.urlAddr) + '/' + encodeURI(realName)
      // 判断移动后的目标地址是否加密名字
      const { passwdInfo: destPasswd } = pathFindPasswd(request.webdavConfig.passwdList, decodeURI(request.headers.destination))
      // 如果是同一个加密路径则保持原加密名字，否则按原明文名字存储，避免认错
      if (destPasswd && destPasswd.id === passwdInfo.id) {
        const realDestName = convertRealName(passwdInfo.password, passwdInfo.encType, decodeURI(request.headers.destination))
        request.headers.destination = path.dirname(request.headers.destination) + '/' + encodeURI(realDestName)
        logger.info('@@distName_enc', encodeURI(realName))
      } else if (showName.indexOf(origPrefix) === 0) {
        // 如果是orig_开头，则恢复原明文名字，此时也是realName
        request.headers.destination = path.dirname(request.headers.destination) + '/' + encodeURI(realName)
      }
    }
    // 群晖再移动文件后，会立刻查询这个文件，如果文件不存在或者显示的文字不一样就会显示异常，实际移动成功。
    // 一般移动到新的加密目录才会出现这样的页面错误，实际不影响使用。
    let destination = request.headers.destination
    const destUrl = new URL(destination)
    const userName = destUrl.username
    // destination，获取/dav/xxx的路径
    const pathname = destUrl.pathname
    if (userName) {
      request.headers.destination = `http://${userName}@${request.headers.host}` + pathname
    } else {
      request.headers.destination = `http://${request.headers.host}` + pathname
    }
    logger.info('@@move_dest', destination, request.headers.destination)
    const body = await httpClient(request, response)
    ctx.status = ctx.res.statusCode
    ctx.body = body
    return
  }
  // 处理文件上传
  if ('PUT' === request.method.toLocaleUpperCase() && passwdInfo) {
    let fileName = path.basename(decodeURI(request.url))
    if (passwdInfo.encName) {
      fileName = convertRealName(passwdInfo.password, passwdInfo.encType, decodeURI(request.url))
      // logger.info('@@convert file name', fileName, realName)
      request.url = path.dirname(request.url) + '/' + encodeURI(fileName)
      request.urlAddr = path.dirname(request.urlAddr) + '/' + encodeURI(fileName)
    }
    // cache file before upload in next(), rclone cmd 'copy' will PROPFIND this file when the file upload success right now
    const contentLength = request.headers['content-length'] || request.headers['x-expected-entity-length'] || 0
    // 注意这里缓存的路径，不要跟上面cacheWebdavFileInfo 冲突, 不然size会归0
    // 上传之后要立刻缓存起来，把加密的名字对应的路径缓存起来
    const fileDetail = { path: request.url, name: fileName, is_dir: false, size: contentLength }
    logger.info('@@webdav_put_info', request.url, fileName, request.headers)
    // 在页面上传文件，rclone会重复上传，所以要进行缓存文件信息,让他能找到文件信息，也不能在next() 因为rclone copy命令会出异常
    await cacheFileInfo(fileDetail, true)
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, contentLength * 1)
    return await httpProxy(request, response, flowEnc.encryptTransform())
  }
  // GET file
  if ('GET,HEAD,DELETE,POST'.includes(request.method.toLocaleUpperCase()) && passwdInfo && passwdInfo.encName) {
    const url = request.url
    // check dir, convert url
    const realName = convertRealName(passwdInfo.password, passwdInfo.encType, decodeURI(url))
    // maybe from aliyundrive, check this req url while get file list from enc folder
    // 这里的代码应该是过时了，无法验证，因为GET和endsWith('/')不可能同时出现，会报错405
    if (url.endsWith('/') && 'GET,DELETE'.includes(request.method.toLocaleUpperCase())) {
      let respBody = await httpClient(ctx.req, ctx.res)
      if (request.method.toLocaleUpperCase() === 'GET') {
        const aurlArr = respBody.match(/href="[^"]*"/g)
        logger.info('@@ali_urlArr', aurlArr, respBody)
        if (aurlArr && aurlArr.length) {
          for (let urlStr of aurlArr) {
            urlStr = urlStr.replace('href="', '').replace('"', '')
            const aurl = decodeURI(urlStr.replace('href="', '').replace('"', ''))
            const baseUrl = decodeURI(url)
            if (aurl.includes(baseUrl)) {
              const fileName = path.basename(aurl)
              const showName = convertShowName(passwdInfo.password, passwdInfo.encType, fileName)
              logger.debug('@@ali_url', urlStr, showName)
              respBody = respBody.replace(path.basename(urlStr), encodeURI(showName)).replace(fileName, showName)
            }
          }
        }
      }
      logger.info('@@GET_DELETE', respBody)
      ctx.status = respBody.statusCode
      ctx.body = respBody
      return
    }
    // 如果是文件夹目录则透传，如果是文件则替换加密后的文件名字
    // 一般GET请求是文件，DELETE是文件夹
    let fileInfo = await getFileInfo(decodeURI(request.url))
    if (!fileInfo) {
      // 尝试使用加密的名字，realFileName可能是目录或者无后缀文件名
      const encUrl = decodeURI(path.dirname(request.url)) + '/' + realName
      // encUrl已经encodeUrl了
      fileInfo = await getFileInfo(encUrl)
    }
    // 替换连接
    if (fileInfo && !fileInfo.is_dir) {
      request.url = path.dirname(request.url) + '/' + encodeURI(realName)
      request.urlAddr = path.dirname(request.urlAddr) + '/' + encodeURI(realName)
    }
  }
  // 如果是下载文件，那么就进行判断是否解密
  if ('GET,HEAD,POST'.includes(request.method.toLocaleUpperCase()) && passwdInfo) {
    // 要定位请求文件的位置 bytes=98304-
    const range = request.headers.range
    const start = range ? range.replace('bytes=', '').split('-')[0] * 1 : 0
    // 根据文件路径来获取文件的大小
    const urlPath = ctx.req.url.split('?')[0]
    let filePath = urlPath
    request.fileSize = 0
    // 尝试获取文件信息，如果未找到相应的文件信息，则对文件名进行加密处理后重新尝试获取文件信息
    let fileInfo = await getFileInfo(filePath, true)
    if (fileInfo === null) {
      const realFileName = convertRealName(passwdInfo.password, passwdInfo.encType, filePath)
      // 可能是处理webdav进来了，filePath 需要decodeURI=true
      const encodedRawFileName = path.basename(filePath)
      logger.info('@@webdav_encodeName:', filePath, fileInfo, request.urlAddr)
      filePath = filePath.replace(encodedRawFileName, realFileName)
      fileInfo = await getFileInfo(filePath, true)
      if (fileInfo) {
        // 使用加密的名字
        request.urlAddr = request.urlAddr.replace(encodedRawFileName, encodeURI(realFileName))
      }
    }
    // 文件复制后，群晖就会立刻查询文件的信息 HEAD，这里就有一些系列的判断需要处理。。。
    logger.info('@@webdav_getFileInfo:', filePath, fileInfo, request.urlAddr)
    if (fileInfo) {
      request.fileSize = fileInfo.size * 1
    } else if (request.headers.authorization) {
      // 这里要从就是webdav请求了文件信息
      const authorization = request.headers.authorization
      const webdavFileInfo = await getWebdavFileInfo(request.urlAddr, authorization)
      logger.info('@@webdavFileInfo_size:', filePath, request.urlAddr, webdavFileInfo)
      if (webdavFileInfo) {
        webdavFileInfo.path = filePath
        // 某些get请求返回的size=0，不要缓存起来
        if (webdavFileInfo.size * 1 > 0) {
          cacheFileInfo(webdavFileInfo, true)
        }
        request.fileSize = webdavFileInfo.size * 1
      }
    }
    request.passwdInfo = passwdInfo
    logger.info('@@@@request.filePath ', filePath, request.fileSize)
    if (request.fileSize === 0) {
      // 说明不用加密
      return await httpProxy(request, response)
    }
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, request.fileSize)
    if (start) {
      await flowEnc.setPosition(start)
    }
    return await httpProxy(request, response, null, flowEnc.decryptTransform())
  }
  logger.info('@@end preHandle', request.method, request.url)
  await next()
}

export default preHandle
