//获取用户信息
import axiosReq from '@/utils/axios-req'
export const userInfoReq = () => {
  return new Promise((resolve) => {
    const reqConfig = {
      url: '/enc-api/getUserInfo',
      params: { plateFormId: 2 },
      method: 'post'
    }
    axiosReq(reqConfig).then(({ data }) => {
      resolve(data)
    })
  })
}
// 更新密码
export const upatePasswordReq = (subForm) => {
  return axiosReq({
    url: '/enc-api/updatePasswd',
    data: subForm,
    method: 'post'
  })
}
// 获取alist的配置信息
export const getAlistConfigReq = (subForm) => {
  return axiosReq({
    url: '/enc-api/getAlistConfig',
    data: subForm,
    method: 'post'
  })
}
// 保存信息
export const saveAlistConfigReq = (subForm) => {
  return axiosReq({
    url: '/enc-api/saveAlistConfig',
    data: subForm,
    method: 'post'
  })
}

// 获取webdav配置信息
export const getWebdavConfigReq = (subForm) => {
  return axiosReq({
    url: '/enc-api/getWebdavonfig',
    data: subForm,
    method: 'post'
  })
}

export const saveWebdavConfigReq = (subForm) => {
  return axiosReq({
    url: '/enc-api/saveWebdavConfig',
    data: subForm,
    method: 'post'
  })
}
export const updateWebdavConfigReq = (subForm) => {
  return axiosReq({
    url: '/enc-api/updateWebdavConfig',
    data: subForm,
    method: 'post'
  })
}

export const delWebdavConfigReq = (subForm) => {
  return axiosReq({
    url: '/enc-api/delWebdavConfig',
    data: subForm,
    method: 'post'
  })
}

export const encodeFoldNameReq = (subForm) => {
  return axiosReq({
    url: '/enc-api/encodeFoldName',
    data: subForm,
    method: 'post'
  })
}

export const decodeFoldNameReq = (subForm) => {
  return axiosReq({
    url: '/enc-api/decodeFoldName',
    data: subForm,
    method: 'post'
  })
}

export const checkFilePathReq = (subForm) => {
  return axiosReq({
    url: '/enc-api/checkFilePath',
    data: subForm,
    method: 'post'
  })
}
export const encryptFileReq = (subForm) => {
  return axiosReq({
    url: '/enc-api/encryptFile',
    data: subForm,
    method: 'post'
  })
}

// login
export const loginReq = (subForm) => {
  return axiosReq({
    url: '/enc-api/login',
    data: subForm,
    method: 'post'
  })
}

//退出登录
export const loginOutReq = () => {
  return axiosReq({
    url: '/mock/basis-func/user/loginValid',
    method: 'post'
  })
}
