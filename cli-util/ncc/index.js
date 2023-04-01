module.exports =
/******/ (function(modules, runtime) { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete installedModules[moduleId];
/******/ 		}
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	__webpack_require__.ab = __dirname + "/";
/******/
/******/ 	// the startup function
/******/ 	function startup() {
/******/ 		// Load entry module and return exports
/******/ 		return __webpack_require__(907);
/******/ 	};
/******/ 	// initialize runtime
/******/ 	runtime(__webpack_require__);
/******/
/******/ 	// run startup
/******/ 	return startup();
/******/ })
/************************************************************************/
/******/ ({

/***/ 136:
/***/ (function(__unusedmodule, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.useNative = exports.useNativeSync = void 0;
const fs_1 = __webpack_require__(747);
const opts_arg_js_1 = __webpack_require__(931);
const version = process.env.__TESTING_MKDIRP_NODE_VERSION__ || process.version;
const versArr = version.replace(/^v/, '').split('.');
const hasNative = +versArr[0] > 10 || (+versArr[0] === 10 && +versArr[1] >= 12);
exports.useNativeSync = !hasNative
    ? () => false
    : (opts) => (0, opts_arg_js_1.optsArg)(opts).mkdirSync === fs_1.mkdirSync;
exports.useNative = Object.assign(!hasNative
    ? () => false
    : (opts) => (0, opts_arg_js_1.optsArg)(opts).mkdir === fs_1.mkdir, {
    sync: exports.useNativeSync,
});
//# sourceMappingURL=use-native.js.map

/***/ }),

/***/ 264:
/***/ (function(__unusedmodule, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.pathArg = void 0;
const platform = process.env.__TESTING_MKDIRP_PLATFORM__ || process.platform;
const path_1 = __webpack_require__(622);
const pathArg = (path) => {
    if (/\0/.test(path)) {
        // simulate same failure that node raises
        throw Object.assign(new TypeError('path must be a string without null bytes'), {
            path,
            code: 'ERR_INVALID_ARG_VALUE',
        });
    }
    path = (0, path_1.resolve)(path);
    if (platform === 'win32') {
        const badWinChars = /[*|"<>?:]/;
        const { root } = (0, path_1.parse)(path);
        if (badWinChars.test(path.substring(root.length))) {
            throw Object.assign(new Error('Illegal characters in path.'), {
                path,
                code: 'EINVAL',
            });
        }
    }
    return path;
};
exports.pathArg = pathArg;
//# sourceMappingURL=path-arg.js.map

/***/ }),

/***/ 413:
/***/ (function(module) {

module.exports = require("stream");

/***/ }),

/***/ 417:
/***/ (function(module) {

module.exports = require("crypto");

/***/ }),

/***/ 429:
/***/ (function(__unusedmodule, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.mkdirpNative = exports.mkdirpNativeSync = void 0;
const path_1 = __webpack_require__(622);
const find_made_js_1 = __webpack_require__(980);
const mkdirp_manual_js_1 = __webpack_require__(575);
const opts_arg_js_1 = __webpack_require__(931);
const mkdirpNativeSync = (path, options) => {
    const opts = (0, opts_arg_js_1.optsArg)(options);
    opts.recursive = true;
    const parent = (0, path_1.dirname)(path);
    if (parent === path) {
        return opts.mkdirSync(path, opts);
    }
    const made = (0, find_made_js_1.findMadeSync)(opts, path);
    try {
        opts.mkdirSync(path, opts);
        return made;
    }
    catch (er) {
        const fer = er;
        if (fer && fer.code === 'ENOENT') {
            return (0, mkdirp_manual_js_1.mkdirpManualSync)(path, opts);
        }
        else {
            throw er;
        }
    }
};
exports.mkdirpNativeSync = mkdirpNativeSync;
exports.mkdirpNative = Object.assign(async (path, options) => {
    const opts = { ...(0, opts_arg_js_1.optsArg)(options), recursive: true };
    const parent = (0, path_1.dirname)(path);
    if (parent === path) {
        return await opts.mkdirAsync(path, opts);
    }
    return (0, find_made_js_1.findMade)(opts, path).then((made) => opts
        .mkdirAsync(path, opts)
        .then(m => made || m)
        .catch(er => {
        const fer = er;
        if (fer && fer.code === 'ENOENT') {
            return (0, mkdirp_manual_js_1.mkdirpManual)(path, opts);
        }
        else {
            throw er;
        }
    }));
}, { sync: exports.mkdirpNativeSync });
//# sourceMappingURL=mkdirp-native.js.map

/***/ }),

/***/ 528:
/***/ (function(__unusedmodule, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.mkdirp = exports.mkdirpSync = exports.useNativeSync = exports.useNative = exports.mkdirpNativeSync = exports.mkdirpNative = exports.mkdirpManualSync = exports.mkdirpManual = void 0;
const mkdirp_manual_js_1 = __webpack_require__(575);
const mkdirp_native_js_1 = __webpack_require__(429);
const opts_arg_js_1 = __webpack_require__(931);
const path_arg_js_1 = __webpack_require__(264);
const use_native_js_1 = __webpack_require__(136);
/* c8 ignore start */
var mkdirp_manual_js_2 = __webpack_require__(575);
Object.defineProperty(exports, "mkdirpManual", { enumerable: true, get: function () { return mkdirp_manual_js_2.mkdirpManual; } });
Object.defineProperty(exports, "mkdirpManualSync", { enumerable: true, get: function () { return mkdirp_manual_js_2.mkdirpManualSync; } });
var mkdirp_native_js_2 = __webpack_require__(429);
Object.defineProperty(exports, "mkdirpNative", { enumerable: true, get: function () { return mkdirp_native_js_2.mkdirpNative; } });
Object.defineProperty(exports, "mkdirpNativeSync", { enumerable: true, get: function () { return mkdirp_native_js_2.mkdirpNativeSync; } });
var use_native_js_2 = __webpack_require__(136);
Object.defineProperty(exports, "useNative", { enumerable: true, get: function () { return use_native_js_2.useNative; } });
Object.defineProperty(exports, "useNativeSync", { enumerable: true, get: function () { return use_native_js_2.useNativeSync; } });
/* c8 ignore stop */
const mkdirpSync = (path, opts) => {
    path = (0, path_arg_js_1.pathArg)(path);
    const resolved = (0, opts_arg_js_1.optsArg)(opts);
    return (0, use_native_js_1.useNativeSync)(resolved)
        ? (0, mkdirp_native_js_1.mkdirpNativeSync)(path, resolved)
        : (0, mkdirp_manual_js_1.mkdirpManualSync)(path, resolved);
};
exports.mkdirpSync = mkdirpSync;
exports.mkdirp = Object.assign(async (path, opts) => {
    path = (0, path_arg_js_1.pathArg)(path);
    const resolved = (0, opts_arg_js_1.optsArg)(opts);
    return (0, use_native_js_1.useNative)(resolved)
        ? (0, mkdirp_native_js_1.mkdirpNative)(path, resolved)
        : (0, mkdirp_manual_js_1.mkdirpManual)(path, resolved);
}, {
    mkdirpSync: exports.mkdirpSync,
    mkdirpNative: mkdirp_native_js_1.mkdirpNative,
    mkdirpNativeSync: mkdirp_native_js_1.mkdirpNativeSync,
    mkdirpManual: mkdirp_manual_js_1.mkdirpManual,
    mkdirpManualSync: mkdirp_manual_js_1.mkdirpManualSync,
    sync: exports.mkdirpSync,
    native: mkdirp_native_js_1.mkdirpNative,
    nativeSync: mkdirp_native_js_1.mkdirpNativeSync,
    manual: mkdirp_manual_js_1.mkdirpManual,
    manualSync: mkdirp_manual_js_1.mkdirpManualSync,
    useNative: use_native_js_1.useNative,
    useNativeSync: use_native_js_1.useNativeSync,
});
exports.default = exports.mkdirp;
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 575:
/***/ (function(__unusedmodule, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.mkdirpManual = exports.mkdirpManualSync = void 0;
const path_1 = __webpack_require__(622);
const opts_arg_js_1 = __webpack_require__(931);
const mkdirpManualSync = (path, options, made) => {
    const parent = (0, path_1.dirname)(path);
    const opts = { ...(0, opts_arg_js_1.optsArg)(options), recursive: false };
    if (parent === path) {
        try {
            return opts.mkdirSync(path, opts);
        }
        catch (er) {
            // swallowed by recursive implementation on posix systems
            // any other error is a failure
            const fer = er;
            if (fer && fer.code !== 'EISDIR') {
                throw er;
            }
            return;
        }
    }
    try {
        opts.mkdirSync(path, opts);
        return made || path;
    }
    catch (er) {
        const fer = er;
        if (fer && fer.code === 'ENOENT') {
            return (0, exports.mkdirpManualSync)(path, opts, (0, exports.mkdirpManualSync)(parent, opts, made));
        }
        if (fer && fer.code !== 'EEXIST' && fer && fer.code !== 'EROFS') {
            throw er;
        }
        try {
            if (!opts.statSync(path).isDirectory())
                throw er;
        }
        catch (_) {
            throw er;
        }
    }
};
exports.mkdirpManualSync = mkdirpManualSync;
exports.mkdirpManual = Object.assign(async (path, options, made) => {
    const opts = (0, opts_arg_js_1.optsArg)(options);
    opts.recursive = false;
    const parent = (0, path_1.dirname)(path);
    if (parent === path) {
        return opts.mkdirAsync(path, opts).catch(er => {
            // swallowed by recursive implementation on posix systems
            // any other error is a failure
            const fer = er;
            if (fer && fer.code !== 'EISDIR') {
                throw er;
            }
        });
    }
    return opts.mkdirAsync(path, opts).then(() => made || path, async (er) => {
        const fer = er;
        if (fer && fer.code === 'ENOENT') {
            return (0, exports.mkdirpManual)(parent, opts).then((made) => (0, exports.mkdirpManual)(path, opts, made));
        }
        if (fer && fer.code !== 'EEXIST' && fer.code !== 'EROFS') {
            throw er;
        }
        return opts.statAsync(path).then(st => {
            if (st.isDirectory()) {
                return made;
            }
            else {
                throw er;
            }
        }, () => {
            throw er;
        });
    });
}, { sync: exports.mkdirpManualSync });
//# sourceMappingURL=mkdirp-manual.js.map

/***/ }),

/***/ 622:
/***/ (function(module) {

module.exports = require("path");

/***/ }),

/***/ 747:
/***/ (function(module) {

module.exports = require("fs");

/***/ }),

/***/ 790:
/***/ (function(module, __unusedexports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const index_js_1 = __importDefault(__webpack_require__(528));
module.exports = Object.assign(index_js_1.default, { default: index_js_1.default, mkdirp: index_js_1.default });
//# sourceMappingURL=index-cjs.js.map

/***/ }),

/***/ 907:
/***/ (function(__unusedmodule, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);

// EXTERNAL MODULE: external "fs"
var external_fs_ = __webpack_require__(747);
var external_fs_default = /*#__PURE__*/__webpack_require__.n(external_fs_);

// EXTERNAL MODULE: external "path"
var external_path_ = __webpack_require__(622);
var external_path_default = /*#__PURE__*/__webpack_require__.n(external_path_);

// EXTERNAL MODULE: ./node_modules/mkdirp/dist/cjs/src/index-cjs.js
var index_cjs = __webpack_require__(790);
var index_cjs_default = /*#__PURE__*/__webpack_require__.n(index_cjs);

// EXTERNAL MODULE: external "crypto"
var external_crypto_ = __webpack_require__(417);
var external_crypto_default = /*#__PURE__*/__webpack_require__.n(external_crypto_);

// EXTERNAL MODULE: external "stream"
var external_stream_ = __webpack_require__(413);

// CONCATENATED MODULE: ./utils/mixEnc.js





/**
 * 混淆算法，加密强度低，容易因为文件特征被破解。可以提升encode长度来对抗
 */
class mixEnc_MixEnc {
  constructor(password) {
    this.password = password
    // 说明是输入encode的秘钥，用于找回文件加解密
    this.passwdOutward = password
    if (password.length !== 32) {
      const sha256 = external_crypto_default().createHash('sha256')
      const key = sha256.update(password + 'MIX').digest('hex')
      this.passwdOutward = external_crypto_default().createHash('md5').update(key).digest('hex')
    }
    console.log('this.passwdOutward', this.passwdOutward)
    const sha256 = external_crypto_default().createHash('sha256')
    const encode = sha256.update(this.passwdOutward).digest()
    const decode = []
    const length = encode.length
    const decodeCheck = {}
    for (let i = 0; i < length; i++) {
      const enc = encode[i] ^ i
      // 这里会产生冲突
      if (!decodeCheck[enc % length]) {
        decode[enc % length] = encode[i] & 0xff
        decodeCheck[enc % length] = encode[i]
      } else {
        for (let j = 0; j < length; j++) {
          if (!decodeCheck[j]) {
            encode[i] = (encode[i] & length) | (j ^ i)
            decode[j] = encode[i] & 0xff
            decodeCheck[j] = encode[i]
            break
          }
        }
      }
    }
    this.encode = encode
    this.decode = Buffer.from(decode)
    // console.log('@encode:', this.encode.toString('hex'))
    // console.log('@decode:', this.decode.toString('hex'))
  }

  // MD5
  md5(content) {
    const md5 = external_crypto_default().createHash('md5')
    return md5.update(this.passwdOutward + content).digest('hex')
  }

  async cachePosition() {
    console.log('cachePosition the mix ')
  }

  async setPositionAsync() {
    console.log('in the mix ')
  }

  // 加密流转换
  encryptTransform() {
    return new external_stream_.Transform({
      // 匿名函数确保this是指向 FlowEnc
      transform: (chunk, encoding, next) => {
        next(null, this.encodeData(chunk))
      },
    })
  }

  decryptTransform() {
    // 解密流转换，不能单实例
    return new external_stream_.Transform({
      transform: (chunk, encoding, next) => {
        // this.push()  用push也可以
        next(null, this.decodeData(chunk))
      },
    })
  }

  // 加密方法
  encodeData(data) {
    data = Buffer.from(data)
    for (let i = data.length; i--; ) {
      data[i] ^= this.encode[data[i] % 32]
    }
    return data
  }

  // 解密方法
  decodeData(data) {
    for (let i = data.length; i--; ) {
      data[i] ^= this.decode[data[i] % 32]
    }
    return data
  }
}

// 检查 encode 是否正确使用的
mixEnc_MixEnc.checkEncode = function (_encode) {
  const encode = Buffer.from(_encode, 'hex')
  const length = encode.length
  const decodeCheck = {}
  for (let i = 0; i < encode.length; i++) {
    const enc = encode[i] ^ i
    // 这里会产生冲突
    if (!decodeCheck[enc % length]) {
      decodeCheck[enc % length] = encode[i]
    } else {
      return null
    }
  }
  return encode
}

// const flowEnc = new MixEnc('abc1234', 1234)
// const encode = flowEnc.encodeData('测试的明文加密1234￥%#')
// const nwe = new MixEnc('5fc8482ac3a7b3fd9325566dfdd31673', 1234)
// const decode = nwe.decodeData(encode)
// console.log('@@@decode', encode, decode.toString())

/* harmony default export */ var mixEnc = (mixEnc_MixEnc);

// CONCATENATED MODULE: ./utils/rc4.js





/**
 * RC4算法，安全性相对好很多
 * 可以对 512345678进行 缓存计算节点，这样下次就可以不用计算那么大
 */
class rc4_Rc4 {
  // password，salt: ensure that each file has a different password
  constructor(password, sizeSalt) {
    if (!sizeSalt) {
      throw new Error('salt is null')
    }
    this.password = password
    this.sizeSalt = sizeSalt
    // share you folder passwdOutward safety
    this.passwdOutward = password
    if (password.length !== 32) {
      // add 'RC4' as salt
      const sha256 = external_crypto_default().createHash('sha256')
      const key = sha256.update(password + 'RC4').digest('hex')
      this.passwdOutward = external_crypto_default().createHash('md5').update(key).digest('hex')
    }
    // add salt
    const passwdSalt = this.passwdOutward + sizeSalt
    // fileHexKey: file passwd，can be share
    this.fileHexKey = external_crypto_default().createHash('md5').update(passwdSalt).digest('hex')
    // get seedKey
    const seedKeyBuf = Buffer.from(this.fileHexKey, 'hex')
    this.position = 0
    this.i = 0
    this.j = 0
    this.sbox = []
    this.initKSA(seedKeyBuf)
    // get 128 length key
    const randomKey = []
    this.PRGAExcute(128, (random) => {
      randomKey.push(random)
    })
    this.realRc4Key = Buffer.from(randomKey)
    // last init
    this.initKSA(this.realRc4Key)
  }

  // reset sbox，i，j
  setPosition(newPosition = 0) {
    newPosition *= 1
    this.position = newPosition
    this.initKSA(this.realRc4Key)
    // init position
    this.PRGAExcute(this.position, () => {})
    return this
  }

  encryptText(plainTextLen) {
    const plainBuffer = Buffer.from(plainTextLen)
    return this.encrypt(plainBuffer)
  }

  // 加解密都是同一个方法
  encrypt(plainBuffer) {
    let index = 0
    this.PRGAExcute(plainBuffer.length, (random) => {
      plainBuffer[index] = random ^ plainBuffer[index++]
    })
    return plainBuffer
  }

  // 加密流转换
  encryptTransform() {
    return new external_stream_.Transform({
      // use anonymous func make sure `this` point to rc4
      transform: (chunk, encoding, next) => {
        next(null, this.encrypt(chunk))
      },
    })
  }

  decryptTransform() {
    // 解密流转换，不能单实例
    return new external_stream_.Transform({
      transform: (chunk, encoding, next) => {
        // this.push()  用push也可以
        next(null, this.encrypt(chunk))
      },
    })
  }

  // 初始化长度，因为有一些文件下载 Range: bytes=3600-5000
  PRGAExcute(plainLen, callback) {
    let { sbox: S, i, j } = this
    for (let k = 0; k < plainLen; k++) {
      i = (i + 1) % 256
      j = (j + S[i]) % 256
      // swap
      const temp = S[i]
      S[i] = S[j]
      S[j] = temp
      // 产生伪随机
      callback(S[(S[i] + S[j]) % 256])
    }
    // 记录位置，下次继续伪随机
    this.i = i
    this.j = j
  }

  // KSA初始化sbox，key长度为128比较好？
  initKSA(key) {
    const K = []
    //  对S表进行初始赋值
    for (let i = 0; i < 256; i++) {
      this.sbox[i] = i
    }
    //  用种子密钥对K表进行填充
    for (let i = 0; i < 256; i++) {
      K[i] = key[i % key.length]
    }
    //  对S表进行置换
    for (let i = 0, j = 0; i < 256; i++) {
      j = (j + this.sbox[i] + K[i]) % 256
      const temp = this.sbox[i]
      this.sbox[i] = this.sbox[j]
      this.sbox[j] = temp
    }
    this.i = 0
    this.j = 0
  }
}

// const rc4 = new Rc4('123456')
// const buffer = rc4.encryptText('abc')
// // 要记得重置
// const plainBy = rc4.resetSbox().encrypt(buffer)
// console.log('@@@', buffer, Buffer.from(plainBy).toString('utf-8'))

/* harmony default export */ var rc4 = (rc4_Rc4);

// CONCATENATED MODULE: ./utils/flowEnc.js





class flowEnc_FlowEnc {
  constructor(password, encryptType = 'mix', fileSize = 0) {
    fileSize *= 1
    let encryptFlow = null
    if (encryptType === 'mix') {
      console.log('@@mix', encryptType)
      encryptFlow = new mixEnc(password)
    }
    if (encryptType === 'rc4') {
      console.log('@@rc4', encryptType, fileSize)
      encryptFlow = new rc4(password, fileSize)
    }
    if (encryptType === null) {
      throw new Error('FlowEnc error')
    }
    this.encryptFlow = encryptFlow
    this.encryptType = encryptType
  }

  async setPosition(position) {
    await this.encryptFlow.setPositionAsync(position)
  }

  async cachePosition() {
    await this.encryptFlow.cachePosition()
  }

  // 加密流转换
  encryptTransform() {
    return this.encryptFlow.encryptTransform()
  }

  decryptTransform() {
    return this.encryptFlow.decryptTransform()
  }
}

// const flowEnc = new FlowEnc('abc1234')
// const encode = flowEnc.encodeData('测试的明文加密1234￥%#')
// const decode = flowEnc.decodeData(encode)
// console.log('@@@decode', encode, decode.toString())
// console.log(new FlowEnc('e10adc3949ba56abbe5be95ff90a8636'))

/* harmony default export */ var utils_flowEnc = (flowEnc_FlowEnc);

// CONCATENATED MODULE: ./utils/searchFile.js


function readDirSync(filePath) {
  const fileArray = []
  const files = external_fs_default().readdirSync(filePath)
  files.forEach(function (ele, index) {
    const info = external_fs_default().statSync(filePath + '/' + ele)
    if (info.isDirectory()) {
      //   console.log('dir: ' + ele)
      const deepArr = readDirSync(filePath + '/' + ele)
      fileArray.push(...deepArr)
    } else {
      const data = { size: info.size, filePath: filePath + '/' + ele }
      fileArray.push(data)
    }
  })
  return fileArray
}

/* harmony default export */ var searchFile = (readDirSync);

// CONCATENATED MODULE: ./index.js








//
function enccrypt(password, encType, enc, encPath) {
  encPath = external_path_default().join(process.cwd(), encPath)
  const outPath = process.cwd() + '/outFile/' + Date.now()
  console.log('you input:', password, encType, enc, encPath)
  if (!external_fs_default().existsSync(encPath)) {
    console.log('you input filePath is not exists')
    return
  }
  // 初始化目录
  if (!external_fs_default().existsSync(outPath)) {
    index_cjs_default().sync(outPath)
  }
  // 输入文件路径
  const allFilePath = searchFile(encPath)
  for (const fileInfo of allFilePath) {
    const { filePath, size } = fileInfo
    const absPath = filePath.replace(encPath, '')
    const outFilePath = outPath + absPath
    index_cjs_default().sync(external_path_default().dirname(outFilePath))
    // 开始加密
    if (size === 0) {
      continue
    }
    const flowEnc = new utils_flowEnc(password, encType, size)
    console.log('@@outFilePath', outFilePath, encType, size)
    const writeStream = external_fs_default().createWriteStream(outFilePath)
    const readStream = external_fs_default().createReadStream(filePath)
    readStream.pipe(enc === 'enc' ? flowEnc.encryptTransform() : flowEnc.decryptTransform()).pipe(writeStream)
  }
}
const arg = process.argv.slice(2)
if (arg.length > 3) {
  enccrypt(...arg)
} else {
  console.log('input error， example param:nodejs-linux passwd12345 rc4 enc /home/myfolder ')
}

console.log('finish!!!')


/***/ }),

/***/ 931:
/***/ (function(__unusedmodule, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.optsArg = void 0;
const fs_1 = __webpack_require__(747);
const optsArg = (opts) => {
    if (!opts) {
        opts = { mode: 0o777 };
    }
    else if (typeof opts === 'object') {
        opts = { mode: 0o777, ...opts };
    }
    else if (typeof opts === 'number') {
        opts = { mode: opts };
    }
    else if (typeof opts === 'string') {
        opts = { mode: parseInt(opts, 8) };
    }
    else {
        throw new TypeError('invalid options argument');
    }
    const resolved = opts;
    const optsFs = opts.fs || {};
    opts.mkdir = opts.mkdir || optsFs.mkdir || fs_1.mkdir;
    opts.mkdirAsync = opts.mkdirAsync
        ? opts.mkdirAsync
        : async (path, options) => {
            return new Promise((res, rej) => resolved.mkdir(path, options, (er, made) => er ? rej(er) : res(made)));
        };
    opts.stat = opts.stat || optsFs.stat || fs_1.stat;
    opts.statAsync = opts.statAsync
        ? opts.statAsync
        : async (path) => new Promise((res, rej) => resolved.stat(path, (err, stats) => (err ? rej(err) : res(stats))));
    opts.statSync = opts.statSync || optsFs.statSync || fs_1.statSync;
    opts.mkdirSync = opts.mkdirSync || optsFs.mkdirSync || fs_1.mkdirSync;
    return resolved;
};
exports.optsArg = optsArg;
//# sourceMappingURL=opts-arg.js.map

/***/ }),

/***/ 980:
/***/ (function(__unusedmodule, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.findMadeSync = exports.findMade = void 0;
const path_1 = __webpack_require__(622);
const findMade = async (opts, parent, path) => {
    // we never want the 'made' return value to be a root directory
    if (path === parent) {
        return;
    }
    return opts.statAsync(parent).then(st => (st.isDirectory() ? path : undefined), // will fail later
    // will fail later
    er => {
        const fer = er;
        return fer && fer.code === 'ENOENT'
            ? (0, exports.findMade)(opts, (0, path_1.dirname)(parent), parent)
            : undefined;
    });
};
exports.findMade = findMade;
const findMadeSync = (opts, parent, path) => {
    if (path === parent) {
        return undefined;
    }
    try {
        return opts.statSync(parent).isDirectory() ? path : undefined;
    }
    catch (er) {
        const fer = er;
        return fer && fer.code === 'ENOENT'
            ? (0, exports.findMadeSync)(opts, (0, path_1.dirname)(parent), parent)
            : undefined;
    }
};
exports.findMadeSync = findMadeSync;
//# sourceMappingURL=find-made.js.map

/***/ })

/******/ },
/******/ function(__webpack_require__) { // webpackRuntimeModules
/******/ 	"use strict";
/******/ 
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	!function() {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = function(exports) {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/define property getter */
/******/ 	!function() {
/******/ 		// define getter function for harmony exports
/******/ 		var hasOwnProperty = Object.prototype.hasOwnProperty;
/******/ 		__webpack_require__.d = function(exports, name, getter) {
/******/ 			if(!hasOwnProperty.call(exports, name)) {
/******/ 				Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 			}
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/create fake namespace object */
/******/ 	!function() {
/******/ 		// create a fake namespace object
/******/ 		// mode & 1: value is a module id, require it
/******/ 		// mode & 2: merge all properties of value into the ns
/******/ 		// mode & 4: return value when already ns object
/******/ 		// mode & 8|1: behave like require
/******/ 		__webpack_require__.t = function(value, mode) {
/******/ 			if(mode & 1) value = this(value);
/******/ 			if(mode & 8) return value;
/******/ 			if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 			var ns = Object.create(null);
/******/ 			__webpack_require__.r(ns);
/******/ 			Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 			if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 			return ns;
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	!function() {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = function(module) {
/******/ 			var getter = module && module.__esModule ?
/******/ 				function getDefault() { return module['default']; } :
/******/ 				function getModuleExports() { return module; };
/******/ 			__webpack_require__.d(getter, 'a', getter);
/******/ 			return getter;
/******/ 		};
/******/ 	}();
/******/ 	
/******/ }
);