'use strict'

import { pathFindPasswd, convertRealName, convertShowName, convertRealPath, convertShowPath } from './utils/commonUtil'
import { cacheFileInfo, getFileInfo } from './dao/fileDao'
import { logger } from './common/logger'
import path from 'path'
import { httpClient, httpProxy } from './utils/httpClient'
import { XMLParser } from 'fast-xml-parser'
import FlowEnc from '@/utils/flowEnc'
import { getWebdavFileInfo } from '@/utils/webdavClient'
import { ids } from 'webpack'

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

/**
 * 获取文件信息
 * @param {object} fileInfo 文件信息
 * @param {object} passwdInfo 密码信息
 * @returns {}
 */
function getFileNameForShow(fileInfo, passwdInfo) {
  const href = fileInfo.href
  const fileName = path.basename(href)
  let propstat = fileInfo.propstat
  if (fileInfo.propstat instanceof Array) {
    propstat = fileInfo.propstat[0]
  }
  const resType = propstat.prop.resourcetype ?? {}
  const isFolder = Object.hasOwn(resType, 'collection')
  // logger.debug('@@fileInfo_show', JSON.stringify(fileInfo))
  if (!isFolder) {
    const showName = convertShowName(passwdInfo.password, passwdInfo.encType, decodeURI(href))
    return { fileName, showName }
  } else if (passwdInfo.encFolder) {
    // example: /dav/aliyun/atest/1324ef/ -> /dav/aliyun/atest/U9UjdknW2/
    // 最好去掉最后的'/' endsWith('/'),虽然不去掉也能正常返回
    const showFolderName = convertShowName(passwdInfo.password, passwdInfo.encType, decodeURI(href))
    return { fileName, showFolderName }
  }
  return {}
}

/**
 * 转换真实加密路径
 * @param {string} href 路径
 * @param {object} passwdInfo 密码信息
 * @param {string} isDir 是否目录
 */
function convertShowFilePath(href, passwdInfo, isDir) {
  let fileName = path.basename(href)
  if (passwdInfo && isDir) {
    // 直接还原整条路径
    return convertShowPath(passwdInfo, href)
  } else if (passwdInfo?.encName) {
    fileName = convertShowName(passwdInfo.password, passwdInfo.encType, fileName)
  }
  // 尝试还原真实加密路径
  const folderPath = path.dirname(href)
  let realPath = convertShowPath(passwdInfo, folderPath)
  realPath = realPath + '/' + fileName
  return realPath
}

/**
 * 缓存文件信息
 * @param {*} fileInfo 文件信息
 * @param {*} passwdInfo 密码信息
 * @returns
 */
function cacheWebdavFileInfo(fileInfo, passwdInfo) {
  const href = fileInfo.href
  const fileName = path.basename(href)
  let propstat = fileInfo.propstat
  if (fileInfo.propstat instanceof Array) {
    propstat = fileInfo.propstat[0]
  }
  // 有一些文件不返回resourcetype
  const resType = propstat.prop.resourcetype ?? {}
  const isFolder = Object.hasOwn(resType, 'collection')
  const showPath = convertShowFilePath(decodeURI(href), passwdInfo, isFolder)
  logger.info('@@cacheWebdavFileInfo', decodeURI(href), showPath, fileName, isFolder)
  // 这里可以判断是否有
  if (!isFolder) {
    const getcontentlength = propstat.prop.getcontentlength
    const fileDetail = { path: href, showPath, name: fileName, is_dir: isFolder, size: getcontentlength }
    cacheFileInfo(fileDetail, true)
    return fileDetail
  }
  // cache this folder info
  const fileDetail = { path: href, showPath, name: fileName, is_dir: isFolder, size: 0 }
  cacheFileInfo(fileDetail, true)
  return fileDetail
}

// 拦截webdav，预处理request
const preHandle = async (ctx, next) => {
  const request = ctx.req
  const response = ctx.res
  const { passwdList } = request.webdavConfig
  // 先处理路径，群晖的url请求是decodeURIComponent进行处理的，而其他的webdav服务是encodeURI,这里先做兼容。
  const reqUrl = request.url
  request.url = encodeURI(decodeURIComponent(reqUrl))
  request.urlAddr = request.urlAddr.replace(reqUrl, request.url)
  // encodeURI之后然后再匹配路径是否加密
  const { passwdInfo } = pathFindPasswd(passwdList, decodeURI(request.url))
  const baseUrl = request.url

  // 处理业务，创建目录
  if (ctx.method.toLocaleUpperCase() === 'MKCOL' && passwdInfo?.encFolder) {
    // 对名字进行加密, TODO
    const url = request.url
    const realUrl = convertRealPath(passwdInfo, url, true)
    request.url = request.url.replace(url, realUrl)
    request.urlAddr = request.urlAddr.replace(url, realUrl)
    const fileName = path.basename(realUrl)
    const fileDetail = { path: request.url, showPath: decodeURI(baseUrl), name: fileName, is_dir: true, size: 0 }
    logger.info('@@MKCOL_fileDetail', request.urlAddr, fileDetail)
    // 在页面创建文件夹，需要缓存起来，不然群晖会去查询这个文件夹是否存在，不存在就会报错，实际已经创建成功。
    await cacheFileInfo(fileDetail, true)
    return await httpProxy(ctx.req, ctx.res)
  }

  // 处理文件上传
  if ('PUT' === request.method.toLocaleUpperCase() && passwdInfo) {
    const fileName = path.basename(decodeURI(request.url))
    // 从缓存查询文件夹的真实路径
    let filePath = path.dirname(request.url)
    let finfo = await getFileInfo(decodeURI(filePath) + '/')
    // 如果查询不到，那么可能是不加密的目录
    if (finfo) {
      const realPath = finfo.path
      request.url = request.url.replace(filePath, realPath)
      request.urlAddr = request.urlAddr.replace(filePath, realPath)
    } else {
      // 手动转加密目录，一般不会出现这样的情况
      filePath = convertRealPath(passwdInfo, filePath, true)
      request.url = request.url.replace(baseUrl, filePath + '/' + fileName)
      request.urlAddr = request.urlAddr.replace(baseUrl, filePath + '/' + fileName)
    }

    if (passwdInfo.encName) {
      const realName = convertRealName(passwdInfo.password, passwdInfo.encType, decodeURI(request.url))
      // logger.info('@@convert file name', fileName, realName)
      request.url = path.dirname(request.url) + '/' + encodeURI(realName)
      request.urlAddr = path.dirname(request.urlAddr) + '/' + encodeURI(realName)
    }
    // cache file before upload in next(), rclone cmd 'copy' will PROPFIND this file when the file upload success right now
    const contentLength = request.headers['content-length'] || request.headers['x-expected-entity-length'] || 0
    // 注意这里缓存的路径，不要跟上面 cacheWebdavFileInfo 冲突, 不然size会归0
    // 上传之后要立刻缓存起来，把加密的名字对应的路径缓存起来
    const fileDetail = { path: request.url, showPath: decodeURI(baseUrl), name: fileName, is_dir: false, size: contentLength }
    logger.info('@@webdav_put_info', request.url, fileName, fileDetail)
    // 在页面上传文件，rclone会重复上传，所以要进行缓存文件信息,让他能找到文件信息，也不能在next() 因为rclone copy命令会出异常
    await cacheFileInfo(fileDetail, true)
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, contentLength * 1)
    return await httpProxy(request, response, flowEnc.encryptTransform())
  }

  // 判断是目录还是文件，新方案直接通过缓存来判断，而且升级新名字加密算法需要兼容
  let isDir = false
  // baseUrl有2种形式/dav/atest/folder/ /dav/atest/folder,一个查询文件夹信息，一个查询文件列表
  let finfo = await getFileInfo(decodeURI(baseUrl))
  // 如果是文件夹，则主动添加 '/' 进行查询
  if (!finfo && !baseUrl.endsWith('/')) {
    finfo = await getFileInfo(decodeURI(baseUrl) + '/')
  }
  if (finfo) {
    isDir = finfo.is_dir
    // 使用真的加密路径
    if (isDir && !baseUrl.endsWith('/')) {
      finfo.path = finfo.path.slice(0, -1)
    }
    request.url = request.url.replace(baseUrl, encodeURI(finfo.path))
    request.urlAddr = request.urlAddr.replace(baseUrl, encodeURI(finfo.path))
  }

  // 列表查询或者文件信息查询，把返回来的名字进行加密
  if (ctx.method.toLocaleUpperCase() === 'PROPFIND' && passwdInfo) {
    logger.info('@@request_webdav', baseUrl, ctx.req.url, request.urlAddr)
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
          // cache real file info，include forder name
          cacheWebdavFileInfo(fileInfo, passwdInfo)
          if (passwdInfo?.encName) {
            const { fileName, showName, showFolderName } = getFileNameForShow(fileInfo, passwdInfo)
            // logger.debug('@@getFileNameForShow1 list', passwdInfo.password, fileName, decodeURI(fileName), showName)
            if (fileName) {
              let replaceShowName = showName || showFolderName
              let showXmlName = replaceShowName.replace(/&/g, '&amp;').replace(/</g, '&gt;')
              // 群晖的展示的名字是hrefName，ES文件夹展示的名字是displayname ，各种坑爹客户端
              const displayname = decodeURI(fileName).replace(/&/g, '&amp;').replace(/</g, '&gt;')
              const hrefName = fileName.replace(/&/g, '&amp;').replace(/</g, '&gt;')
              logger.debug('@@respBody_list', request.url, baseUrl, fileInfo.href, fileName, hrefName, respBody)
              let endsWith = showName ? '' : '/'
              // 先把加密的路径替换掉
              respBody = respBody.replace(request.url.replace(/&/g, '&amp;').replace(/</g, '&gt;'), baseUrl.replace(/&/g, '&amp;').replace(/</g, '&gt;'))
              if (baseUrl === fileInfo.href) {
                // 不替换跟目录的href连接名字
                return
              }
              // 因为上面执行了replace，所以一定要前置 `/${hrefName}，不然会出现orig_orig_xxx.txt的情况
              respBody = respBody.replace(`/${hrefName}${endsWith}</D:href>`, `/${encodeURI(showXmlName)}${endsWith}</D:href>`)
              respBody = respBody.replace(`${displayname}</D:displayname>`, `${showXmlName}</D:displayname>`)
            }
          }
        })
        // waiting cacheWebdavFileInfo a moment
        await sleep(50)
      } else if (passwdInfo?.encName) {
        // 这里PROPFIND请求的是文件信息，上面得到是列表后，客户端还会继续请求每个文件的信息。。。
        const fileInfo = respJson
        // showName已经是decodeUrl处理过了
        const { fileName, showName, showFolderName } = getFileNameForShow(fileInfo, passwdInfo)
        // logger.debug('@@getFileNameForShow2 file', fileName, showName, url, respJson.propstat)
        if (fileName) {
          let replaceShowName = showName || showFolderName
          let showXmlName = replaceShowName.replace(/&/g, '&amp;').replace(/</g, '&gt;')
          // 群晖的展示的名字是hrefName，ES文件夹展示的名字是displayname ，各种坑爹客户端
          const displayname = decodeURI(fileName).replace(/&/g, '&amp;').replace(/</g, '&gt;')
          const hrefName = fileName.replace(/&/g, '&amp;').replace(/</g, '&gt;')
          let endsWith = showName ? '' : '/'
          // 这个是查询文件详情，所以可以直接替换
          logger.debug('@@respBody_detail', request.url, baseUrl, fileName, respBody)
          respBody = respBody.replace(request.url.replace(/&/g, '&amp;').replace(/</g, '&gt;'), baseUrl.replace(/&/g, '&amp;').replace(/</g, '&gt;'))
          // 下面这个其实可以不用了，只要修复目录的 & 符号问题，就可以把下面的去掉
          respBody = respBody.replace(`/${hrefName}${endsWith}</D:href>`, `/${encodeURI(showXmlName)}${endsWith}</D:href>`)
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
    // 目标的目录进行加密后处理
    const destPath = encodeURI(decodeURIComponent(request.headers.destination))
    // const fileName = path.basename(url)
    const destfolderPath = path.dirname(destPath)
    let realDestPath = convertRealPath(passwdInfo, destfolderPath, true)
    request.headers.destination = realDestPath + '/' + path.basename(destPath)
    if (isDir) {
      realDestPath = convertRealPath(passwdInfo, destPath, true)
      request.headers.destination = realDestPath
    }
    logger.debug('@@move_src', baseUrl, request.headers.destination)
    if (passwdInfo?.encName && !isDir) {
      // 判断移动后的目标地址是否加密名字
      const { passwdInfo: destPasswd } = pathFindPasswd(request.webdavConfig.passwdList, decodeURI(request.headers.destination))
      // 如果是同一个加密路径则保持原加密名字，否则按新的加密目录的原明文名字存储（新目录会显示orig_xxx）
      // 因为密码可能不一样，不应该直接显示名称，本来就不推荐迁移到不同加密目录下。
      if (destPasswd?.id === passwdInfo.id) {
        const realDestName = convertRealName(passwdInfo.password, passwdInfo.encType, decodeURI(request.headers.destination))
        request.headers.destination = path.dirname(request.headers.destination) + '/' + encodeURI(realDestName)
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
    logger.info('@@move_dest', request.url, destination)
    const body = await httpClient(request, response)
    ctx.status = ctx.res.statusCode
    ctx.body = body
    return
  }

  // GET file
  if ('GET,HEAD,DELETE,POST'.includes(request.method.toLocaleUpperCase()) && passwdInfo?.encName) {
    const url = request.url
    // maybe from aliyundrive, check this req url while get file list from enc folder
    // 这里的代码应该是过时了，无法验证，因为GET和endsWith('/')不可能同时出现，会报错405，之前是为了兼容网页版webdav
    if (url.endsWith('/') && 'GET,DELETE'.includes(request.method.toLocaleUpperCase())) {
      let respBody = await httpClient(ctx.req, ctx.res)
      logger.info('@@GET_DELETE', respBody)
      ctx.status = ctx.res.statusCode
      ctx.body = respBody
      return
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
      logger.info('@@webdav_fileInfo:', filePath, request.urlAddr, webdavFileInfo)
      if (webdavFileInfo) {
        webdavFileInfo.path = filePath
        // 某些get请求返回的size=0，不要缓存起来
        if (webdavFileInfo.size * 1 > 0) {
          const showPath = convertShowFilePath(decodeURI(webdavFileInfo.href), passwdInfo, webdavFileInfo.is_dir)
          webdavFileInfo.showPath = showPath
          cacheFileInfo(webdavFileInfo, true)
        }
        request.fileSize = webdavFileInfo.size * 1
      }
    }
    request.passwdInfo = passwdInfo
    logger.info('@webdav_filePath ', filePath, request.fileSize)
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
  logger.info('@@webdav_preHandle', request.method, request.url)
  await next()
}

export default preHandle
