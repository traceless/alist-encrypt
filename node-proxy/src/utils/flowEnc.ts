import { Transform } from 'stream'

import MixEnc from '@/utils/crypto/mixEnc'
import Rc4Md5 from '@/utils/crypto/rc4Md5'
import AesCTR from '@/utils/crypto/aesCTR'
import { logger } from '@/common/logger'

const cachePasswdOutward = {}

class FlowEnc {
  public passwdOutward: string
  public encryptType: EncryptType
  public encryptFlow: EncryptFlow

  constructor(password: string, encryptType: EncryptType = 'mix', fileSize = 0) {
    switch (encryptType) {
      case 'mix':
        logger.info('加解密算法: ', encryptType)
        this.encryptFlow = new MixEnc(password)
        break
      case 'rc4':
        logger.info('加解密算法: ', encryptType, fileSize)
        this.encryptFlow = new Rc4Md5(password, fileSize.toString())
        break
      case 'aesctr':
        logger.info('加解密算法: ', encryptType, fileSize)
        this.encryptFlow = new AesCTR(password, fileSize.toString())
        break
    }

    if (!this.encryptFlow) {
      throw new Error('FlowEnc error')
    }

    this.encryptType = encryptType
    this.passwdOutward = this.encryptFlow.passwdOutward
    cachePasswdOutward[password + encryptType] = this.passwdOutward
  }

  async setPosition(position: number) {
    await this.encryptFlow.setPositionAsync(position)
  }

  // 加密流转换
  encryptTransform(): Transform {
    return this.encryptFlow.encryptTransform()
  }

  decryptTransform(): Transform {
    return this.encryptFlow.decryptTransform()
  }
}

export const getPassWdOutward = function (password: string, encryptType: EncryptType) {
  let passwdOutward = cachePasswdOutward[password + encryptType]
  if (!passwdOutward) {
    const flowEnc = new FlowEnc(password, encryptType, 1)
    passwdOutward = flowEnc.passwdOutward
  }

  return passwdOutward
}

export default FlowEnc
