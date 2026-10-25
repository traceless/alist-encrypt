import { MB, derivePwdKey, encryptAesChunk, encryptCha20Chunk, createReadableStream, encodeName, decodeName } from '/public/shared/crypto-core.js'
import { toast } from '/public/shared/ui.js'
import { registerPage } from '/public/shared/router.js'

// CDN 依赖懒加载：原独立页为 head defer，SPA 下首次进入本页再加载（md5 供 crypto-core 派生密钥，zip.js 供分卷打包）
const CDN_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/blueimp-md5@2.19.0/js/md5.min.js',
  'https://cdn.jsdelivr.net/npm/@zip.js/zip.js@2.8.11/dist/zip.min.js'
]
let cdnPromise = null
function cdnReady() {
  if (!cdnPromise) {
    cdnPromise = Promise.all(CDN_SCRIPTS.map((src) => new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = resolve
      s.onerror = () => reject(new Error('CDN 脚本加载失败：' + src))
      document.head.appendChild(s)
    })))
  }
  return cdnPromise
}

function formatFileSize(bytes, decimals = 2) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(decimals) + ' ' + sizes[i]
}

registerPage('decrypt', {
  mount() {
    const $ = (id) => document.getElementById(id)
    cdnReady().catch((e) => console.error('[decrypt]', e.message))

    // ---------- 文件列表与上传 ----------
    const panels = {
      enc: { files: [] },
      dec: { files: [] },
      zip: { files: [] }
    }

    function renderFileList(key) {
      const arr = panels[key].files
      const listEl = document.querySelector(`[data-drop="${key}"] [data-filelist]`)
      listEl.innerHTML = ''
      arr.forEach((f, idx) => {
        const li = document.createElement('li')
        li.className = 'list-group-item d-flex justify-content-between align-items-center py-1 px-2'
        li.innerHTML = `<span class="text-truncate me-2">${f.name} <span class="text-muted">(${formatFileSize(f.size)})</span></span>`
        const btn = document.createElement('button')
        btn.className = 'btn btn-sm btn-ghost-danger'
        btn.innerHTML = '<i class="ti ti-trash icon"></i>'
        btn.onclick = () => { arr.splice(idx, 1); renderFileList(key) }
        li.appendChild(btn)
        listEl.appendChild(li)
      })
    }

    function bindUpload(key) {
      const wrap = document.querySelector(`[data-drop="${key}"]`)
      const dropzone = wrap.querySelector('[data-dropzone]')
      const fileInput = wrap.querySelector('[data-fileinput]')
      const folderInput = wrap.querySelector('[data-folderinput]')
      const arr = panels[key].files
      dropzone.onclick = () => fileInput.click()
      wrap.querySelector('[data-folderbtn]').onclick = () => folderInput.click()
      wrap.querySelector('[data-clearbtn]').onclick = () => { arr.length = 0; renderFileList(key) }
      const add = (files) => { for (const f of files) arr.push(f); renderFileList(key) }
      fileInput.onchange = () => { add(fileInput.files); fileInput.value = '' }
      folderInput.onchange = () => { add(folderInput.files); folderInput.value = '' }
      dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('bg-azure-lt') })
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('bg-azure-lt'))
      dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('bg-azure-lt'); add(e.dataTransfer.files) })
    }
    bindUpload('enc'); bindUpload('dec'); bindUpload('zip')

    // ---------- 非谷歌内核回退：整文件读入内存分块处理（块边界与流式路径一致） ----------
    async function processFileInMemory(file, pwd, blockSize, selectedAlgo, onProgress) {
      let encryptChunk
      if (selectedAlgo === 'chacha20') {
        encryptChunk = await encryptCha20Chunk(await derivePwdKey(pwd, 'CHA20'), file.size)
      } else {
        encryptChunk = await encryptAesChunk(await derivePwdKey(pwd, 'AES-CTR'), file.size)
      }
      const buf = new Uint8Array(await file.arrayBuffer())
      const out = new Uint8Array(file.size)
      const CHUNK = MB * blockSize
      for (let off = 0; off < buf.length; off += CHUNK) {
        const end = Math.min(off + CHUNK, buf.length)
        // startChunk 必须为 16 倍数，CHUNK 是 MB 倍数满足条件；块边界与流式路径一致
        out.set(await encryptChunk(off, buf.subarray(off, end)), off)
        if (onProgress) onProgress(end / file.size)
      }
      return out
    }

    function downloadBlob(blob, name) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 3000)
    }

    // AES-CTR 流式分块处理：流式写盘（密钥链与加密完全一致，传原始密码由内部统一派生）
    async function processFileAesCtr(file, pwd, blockSize, selectedAlgo, fileHandle, onProgress) {
      let encryptChunk
      if (selectedAlgo === 'chacha20') {
        encryptChunk = await encryptCha20Chunk(await derivePwdKey(pwd, 'CHA20'), file.size)
      } else {
        encryptChunk = await encryptAesChunk(await derivePwdKey(pwd, 'AES-CTR'), file.size)
      }
      const readStream = createReadableStream(encryptChunk, file, blockSize, onProgress)
      const writable = await fileHandle.createWritable()
      await readStream.pipeTo(writable)
    }

    function guard1G(files, downloadMode) {
      const totalSize = files.reduce((s, f) => s + f.size, 0)
      if (totalSize > MB * 1024) {
        toast(`当前浏览器无法流式写盘${downloadMode ? '，走逐卷下载模式' : ''}，文件总大小 ${(totalSize / (MB * 1024)).toFixed(2)} GB 超过 1G 限制，请使用 Chrome / Edge 内核浏览器`, 'warning', 6000)
        return false
      }
      return true
    }

    // ---------- 文件加密 ----------
    $('btnStartEnc').onclick = async () => {
      const btn = $('btnStartEnc')
      const pwd = $('pwdEnc_inp').value.trim()
      const blockSize = Number($('blockEnc').value)
      const selectedAlgo = $('algoEnc').value
      const encNameChecked = $('toggleAppendEnc').checked
      const files = panels.enc.files
      if (!pwd || files.length === 0) {
        toast('请输入密码并且选择文件', 'warning')
        return
      }
      let dirHandle = null
      if (window.showDirectoryPicker) {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      } else if (!guard1G(files)) {
        return
      }
      const barDom = $('encProgBar')
      const txtDom = $('encProgText')
      btn.disabled = true
      txtDom.textContent = '处理中...'
      try {
        // 成功一个移除一个：失败时剩余文件保留在列表里，修正后可直接重试
        while (files.length > 0) {
          const f = files[0]
          let outName = f.name + '.enc'
          if (encNameChecked) {
            outName = await encodeName(pwd, selectedAlgo, f.name) + '.enc'
          }
          if (dirHandle) {
            const fileHandle = await dirHandle.getFileHandle(outName, { create: true })
            await processFileAesCtr(f, pwd, blockSize, selectedAlgo, fileHandle, (p) => {
              barDom.style.width = (p * 100).toFixed(1) + '%'
              txtDom.textContent = `${f.name} ${(p * 100).toFixed(1)}%`
            })
          } else {
            const out = await processFileInMemory(f, pwd, blockSize, selectedAlgo, (p) => {
              barDom.style.width = (p * 100).toFixed(1) + '%'
              txtDom.textContent = `${f.name} ${(p * 100).toFixed(1)}%`
            })
            downloadBlob(new Blob([out]), outName)
          }
          files.shift()
          renderFileList('enc')
        }
        txtDom.textContent = '✅加密完成'
        barDom.style.width = '100%'
        toast('加密完成！', 'success')
        setTimeout(() => barDom.style.width = '0%', 1800)
      } catch (err) {
        console.error(err)
        txtDom.textContent = '加密失败'
        toast('加密失败：' + ((err && err.message) || err), 'danger')
      } finally {
        btn.disabled = false
      }
    }

    // ---------- 文件解密 ----------
    $('btnStartDec').onclick = async () => {
      const btn = $('btnStartDec')
      const pwd = $('pwdDec_inp').value.trim()
      const blockSize = Number($('blockDec').value)
      const selectedAlgo = $('algoDec').value
      const decNameChecked = $('toggleAppendDec').checked
      const files = panels.dec.files
      if (!pwd || files.length === 0) {
        toast('请输入密码并且选择文件', 'warning')
        return
      }
      let dirHandle = null
      if (window.showDirectoryPicker) {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      } else if (!guard1G(files)) {
        return
      }
      const barDom = $('decProgBar')
      const txtDom = $('decProgText')
      btn.disabled = true
      txtDom.textContent = '处理中...'
      try {
        while (files.length > 0) {
          const f = files[0]
          // 密钥链必须与加密完全一致：传原始密码，由 processFileAesCtr 内部统一派生
          let outName
          const stem = f.name.replace(/\.enc$/i, '')
          if (decNameChecked) {
            // 密文名还原原名；非密文名（普通名/crc校验不过）返回 orig_ 前缀原名（与后端约定一致）
            outName = await decodeName(pwd, selectedAlgo, stem)
          } else {
            outName = stem
          }
          if (dirHandle) {
            const fileHandle = await dirHandle.getFileHandle(outName, { create: true })
            await processFileAesCtr(f, pwd, blockSize, selectedAlgo, fileHandle, (p) => {
              barDom.style.width = (p * 100).toFixed(1) + '%'
              txtDom.textContent = `${f.name} ${(p * 100).toFixed(1)}%`
            })
          } else {
            const out = await processFileInMemory(f, pwd, blockSize, selectedAlgo, (p) => {
              barDom.style.width = (p * 100).toFixed(1) + '%'
              txtDom.textContent = `${f.name} ${(p * 100).toFixed(1)}%`
            })
            downloadBlob(new Blob([out]), outName)
          }
          files.shift()
          renderFileList('dec')
        }
        txtDom.textContent = '✅解密完成'
        barDom.style.width = '100%'
        toast('解密完成！', 'success')
        setTimeout(() => barDom.style.width = '0%', 1800)
      } catch (err) {
        console.error(err)
        txtDom.textContent = '解密失败'
        toast('解密失败：' + ((err && err.message) || err), 'danger')
      } finally {
        btn.disabled = false
      }
    }

    // ---------- 解密并转分卷压缩包 ----------
    $('btnStartZip').onclick = async () => {
      const btn = $('btnStartZip')
      const splitBytes = Number($('zipSize').value) * MB
      const blockMB = Number($('blockZip').value)
      const pwd = $('pwdZip_inp').value.trim()
      const selectedAlgo = $('algoZip').value
      const files = panels.zip.files
      if (!pwd || files.length === 0) {
        toast('请输入密码并且选择文件', 'warning')
        return
      }
      try {
        await cdnReady()
      } catch (err) {
        toast(err.message || 'CDN 脚本加载失败', 'danger')
        return
      }
      if (!window.zip || !window.zip.SplitDataWriter) {
        toast('zip.js 未加载完成，请稍后重试', 'warning')
        return
      }
      // iOS Safari 等无 File System Access API 的环境：逐卷内存打包+自动下载，限制总大小 1G
      let dirHandle = null
      if (window.showDirectoryPicker) {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      } else if (!guard1G(files, true)) {
        return
      }
      const barDom = $('zipProgBar')
      const txtDom = $('zipProgText')
      // 单文件用原文件名做基础名（video.mp4.enc → video.z01/video.zip），多文件用 archive
      const baseName = files.length === 1
        ? files[0].name.replace(/\.enc$/i, '').replace(/\.[^.]+$/, '')
        : 'archive'
      const totalSize = files.reduce((s, f) => s + f.size, 0)
      let volumeIndex = 0
      let doneBytes = 0
      const volumeHandles = []
      const volumeBlobs = []
      btn.disabled = true
      txtDom.textContent = '处理中…'
      try {
        // SplitDataWriter：generator 每次 yield 一个卷的写入流，写满 splitBytes 自动切卷
        async function* volumeGenerator() {
          while (true) {
            // 内存路径：上一卷若已写完（说明不是最后卷），此刻确认并立即下载释放
            for (const v of volumeBlobs) downloadBlob(v.blob, v.name)
            volumeBlobs.length = 0
            const name = `${baseName}.z${String(volumeIndex + 1).padStart(2, '0')}`
            if (dirHandle) {
              const fileHandle = await dirHandle.getFileHandle(name, { create: true })
              volumeHandles.push(fileHandle)
              volumeIndex++
              yield { writable: await fileHandle.createWritable() }
            } else {
              // iOS Safari 等无 FSAA 环境：整卷收集后 Blob 化（最后卷等 patch 后改名 .zip 再下载）
              const chunks = []
              volumeIndex++
              yield {
                writable: new WritableStream({
                  write(chunk) { chunks.push(chunk) },
                  close() { volumeBlobs.push({ name, blob: new Blob(chunks) }) },
                })
              }
            }
          }
        }
        const zipWriter = new window.zip.ZipWriter(new window.zip.SplitDataWriter(volumeGenerator(), splitBytes))
        for (const f of files) {
          // 密钥链与加密面板完全一致：密码→PBKDF2→passwdOutward→(AES-CTR: md5(+size) / ChaCha20: SHA-256(+size))
          let encryptChunk
          if (selectedAlgo === 'chacha20') {
            encryptChunk = await encryptCha20Chunk(await derivePwdKey(pwd, 'CHA20'), f.size)
          } else {
            encryptChunk = await encryptAesChunk(await derivePwdKey(pwd, 'AES-CTR'), f.size)
          }
          // 复用同款流：读密文块→解密（CTR/ChaCha 均加解密对称）→enqueue
          const readable = createReadableStream(encryptChunk, f, blockMB, (p) => {
            const total = Math.min((doneBytes + p * f.size) / totalSize, 1) * 100
            barDom.style.width = total.toFixed(1) + '%'
            txtDom.textContent = `解密打包 ${f.name} ${total.toFixed(1)}%`
          })
          // {readable, size} 是 zip.js add 的官方流式形态；level 0 存储模式（密文不可再压缩）
          await zipWriter.add(f.name.replace(/\.enc$/i, ''), { readable, size: f.size }, { level: 0 })
          doneBytes += f.size
        }
        await zipWriter.close()

        // 标准分卷要求最后一卷以 .zip 结尾
        // patch：zip.js 写入的 central directory 起始卷号偏小 1，按 PKZIP AppNote 修正为最后卷号
        const patchEocd = (u8) => {
          for (let i = u8.length - 22; i >= 0; i--) {
            if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) {
              u8[i + 10] = (volumeIndex - 1) & 0xff
              u8[i + 11] = (volumeIndex - 1) >>> 8
              break
            }
          }
          return u8
        }
        if (dirHandle) {
          // FSAA 无 rename：读最后卷→patch→写 .zip 新 handle→删旧卷
          const lastVolName = `${baseName}.z${String(volumeIndex).padStart(2, '0')}`
          const lastFile = await volumeHandles[volumeIndex - 1].getFile()
          const buf = patchEocd(new Uint8Array(await lastFile.arrayBuffer()))
          const zipHandle = await dirHandle.getFileHandle(baseName + '.zip', { create: true })
          const ws = await zipHandle.createWritable()
          await ws.write(buf)
          await ws.close()
          await dirHandle.removeEntry(lastVolName)
        } else {
          // 内存路径：最后卷 patch 后以 .zip 下载（前面的卷已在切卷时下载）
          const last = volumeBlobs.pop()
          const buf = patchEocd(new Uint8Array(await last.blob.arrayBuffer()))
          downloadBlob(new Blob([buf]), baseName + '.zip')
        }

        txtDom.textContent = `✅分卷完成（共 ${volumeIndex} 卷）`
        barDom.style.width = '100%'
        toast(dirHandle ? '分卷压缩包生成完成' : '分卷完成，已触发逐卷下载（请允许浏览器多文件下载）', 'success')
        setTimeout(() => barDom.style.width = '0%', 1800)
      } catch (err) {
        console.error(err)
        txtDom.textContent = '打包失败'
        toast('打包失败：' + ((err && err.message) || err), 'danger')
      } finally {
        btn.disabled = false
      }
    }
  }
})
