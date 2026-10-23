// Tabler 图标内联 SVG（v3.49.0 outline），替代图标字体：页面零 webfont 依赖
// 用法：
//   icon(name, cls)      生成 <svg> 字符串，可直接拼进模板
//   enhanceIcons(root?)  把 <i class="ti ti-x"> 标记元素替换为对应 svg（自动处理动态插入的内容）

const PATHS = {
  "arrow-left": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M5 12l14 0\" /> <path d=\"M5 12l6 6\" /> <path d=\"M5 12l6 -6\" />",
  "bulb": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7\" /> <path d=\"M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3\" /> <path d=\"M9.7 17l4.6 0\" />",
  "cloud-lock": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M19 18a3.5 3.5 0 0 0 0 -7h-1c.397 -1.768 -.285 -3.593 -1.788 -4.787c-1.503 -1.193 -3.6 -1.575 -5.5 -1s-3.315 2.019 -3.712 3.787c-2.199 -.088 -4.155 1.326 -4.666 3.373c-.512 2.047 .564 4.154 2.566 5.027\" /> <path d=\"M8 16a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -3\" /> <path d=\"M10 15v-2a2 2 0 1 1 4 0v2\" />",
  "cloud-upload": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1\" /> <path d=\"M9 15l3 -3l3 3\" /> <path d=\"M12 12l0 9\" />",
  "cloud": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878\" />",
  "copy": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666\" /> <path d=\"M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1\" />",
  "dashboard": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M10 13a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M13.45 11.55l2.05 -2.05\" /> <path d=\"M6.4 20a9 9 0 1 1 11.2 0l-11.2 0\" />",
  "device-floppy": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2\" /> <path d=\"M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M14 4l0 4l-6 0l0 -4\" />",
  "eye-off": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M10.585 10.587a2 2 0 0 0 2.829 2.828\" /> <path d=\"M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87\" /> <path d=\"M3 3l18 18\" />",
  "eye": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0\" /> <path d=\"M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6\" />",
  "folders": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M9 3h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2\" /> <path d=\"M17 16v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h2\" />",
  "info-circle": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /> <path d=\"M12 9h.01\" /> <path d=\"M11 12h1v4h1\" />",
  "key": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0\" /> <path d=\"M15 9h.01\" />",
  "lock-open": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -6\" /> <path d=\"M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /> <path d=\"M8 11v-5a4 4 0 0 1 8 0\" />",
  "lock": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6\" /> <path d=\"M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0\" /> <path d=\"M8 11v-4a4 4 0 1 1 8 0v4\" />",
  "login": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M15 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2\" /> <path d=\"M21 12h-13l3 -3\" /> <path d=\"M11 15l-3 -3\" />",
  "logout": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2\" /> <path d=\"M9 12h12l-3 -3\" /> <path d=\"M18 15l3 -3\" />",
  "moon-stars": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008\" /> <path d=\"M17 4a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2\" /> <path d=\"M19 11h2m-1 -1v2\" />",
  "pencil": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4\" /> <path d=\"M13.5 6.5l4 4\" />",
  "plus": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M12 5l0 14\" /> <path d=\"M5 12l14 0\" />",
  "point": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0\" />",
  "rocket": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3\" /> <path d=\"M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3\" /> <path d=\"M14 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" />",
  "sun-high": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M14.828 14.828a4 4 0 1 0 -5.656 -5.656a4 4 0 0 0 5.656 5.656\" /> <path d=\"M6.343 17.657l-1.414 1.414\" /> <path d=\"M6.343 6.343l-1.414 -1.414\" /> <path d=\"M17.657 6.343l1.414 -1.414\" /> <path d=\"M17.657 17.657l1.414 1.414\" /> <path d=\"M4 12h-2\" /> <path d=\"M12 4v-2\" /> <path d=\"M20 12h2\" /> <path d=\"M12 20v2\" />",
  "trash": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M4 7l16 0\" /> <path d=\"M10 11l0 6\" /> <path d=\"M14 11l0 6\" /> <path d=\"M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12\" /> <path d=\"M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3\" />",
  "wand": "<path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /> <path d=\"M6 21l15 -15l-3 -3l-15 15l3 3\" /> <path d=\"M15 6l3 3\" /> <path d=\"M9 3a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2\" /> <path d=\"M19 13a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2\" />",
}

const SVG_ATTRS = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

export function icon(name, cls = 'icon') {
  const inner = PATHS[name]
  if (!inner) return ''
  return `<svg ${SVG_ATTRS} class="${cls}">${inner}</svg>`
}

function replaceOne(node) {
  const name = [...node.classList].find((c) => c.startsWith('ti-'))?.slice(3)
  if (!name || !PATHS[name]) return
  const cls = [...node.classList].filter((c) => c !== 'ti' && !c.startsWith('ti-')).join(' ')
  node.outerHTML = icon(name, cls)
}

let observerStarted = false
function startObserver() {
  if (observerStarted || typeof MutationObserver === 'undefined') return
  observerStarted = true
  new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return
        if (n.matches && n.matches('i.ti')) replaceOne(n)
        if (n.querySelectorAll) n.querySelectorAll('i.ti').forEach(replaceOne)
      })
    }
  }).observe(document.body, { childList: true, subtree: true })
}

export function enhanceIcons(root = document) {
  if (root.querySelectorAll) root.querySelectorAll('i.ti').forEach(replaceOne)
  startObserver()
}
