const PRGAExcute = function (data) {
  let { sbox: S, i, j, position } = data
  for (let k = 0; k < position * 1; k++) {
    i = (i + 1) % 256
    j = (j + S[i]) % 256
    // swap
    const temp = S[i]
    S[i] = S[j]
    S[j] = temp
  }
  // 记录位置，下次继续伪随机
  return { sbox: S, i, j }
}

process.on('message', function (data) {
  console.log('来自父进程的消息: ' + JSON.stringify(data))
  const resData = PRGAExcute(data)
  process.send(resData)
})
