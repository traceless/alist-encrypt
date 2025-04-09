import nedb from '@/dao/levelDB'

import type { webui } from '@/@types/webui'

export const userTable = 'userTable'

// 获取用户信息
export async function getUserInfo(username: string): Promise<webui.UserInfo | null> {
  const value = await nedb.getValue(userTable)

  if (value == null) {
    return null
  }

  return value[username]
}

// 获取用户信息
export async function getUserByToken(token: string): Promise<webui.UserInfo | null> {
  return await nedb.getValue(token)
}

// 缓存用户信息
export async function cacheUserToken(token: string, userInfo: webui.UserInfo) {
  return await nedb.setExpire(token, userInfo, 60 * 60 * 24)
}

export async function addUserInfo(userInfo: webui.UserInfo) {
  const value = (await nedb.getValue(userTable)) || {}
  value[userInfo.username] = userInfo
  await nedb.setValue(userTable, value)
}

export async function updateUserInfo(userInfo: webui.UserInfo) {
  const value = await nedb.getValue(userTable)
  if (value[userInfo.username]) {
    value[userInfo.username] = userInfo
    await nedb.setValue(userTable, value)
  }
}

export async function deleteUserInfo(userInfo: webui.UserInfo) {
  const value = await nedb.getValue(userTable)
  if (value[userInfo.username]) {
    delete value[userInfo.username]
    await nedb.setValue(userTable, value)
  }
}
