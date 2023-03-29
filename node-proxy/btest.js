// import PRGAExcuteThread from './utils/PRGAThread.js'
import Rc4 from './utils/rc4.js'

const startTime = Date.now()
console.log('@@@PRGAExcute-strat', Date.now())
// 初始化目录
const size = 123456
const rc4 = new Rc4('123456', size)

const rc41 = new Rc4('123456', size)
const rc42 = new Rc4('123456', size)

setTimeout(() => {
  const position = 52346

  const data1 = rc41.setPosition(position)
  console.log('@@@setPosition1', data1)

  const data2 = rc42.setPositionAsync(position).then((res) => {
    console.log('@@@setPosition2', res)
  })

  // rc43.getPositionAsync(position).then((res) => {
  //   console.log('@@@getPositionAsync1', res)
  // })

  // rc44.setPositionAsync(position).then((res) => {
  //   console.log('@@@setPositionAsync2', res)
  // })
}, 2000)
