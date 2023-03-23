import PRGAExcuteThread from './utils/PRGAThread.js'
import fs from 'fs'
import os from 'os'
console.log(parseInt(os.cpus().length / 3) )

// 初始化目录
PRGAExcuteThread({ sbox: [1, 2, 3], i: 1, j: 2, position: 1 }).then(res => {
  console.log(res)
})
