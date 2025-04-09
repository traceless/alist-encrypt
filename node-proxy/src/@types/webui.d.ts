declare namespace webui {
  //webui中登录后用户的信息
  type UserInfo = {
    username: string
    headImgUrl: string
    password: string | null
    roleId: string
  }

  //通过userInfoMiddleware将用户信息添加到ctx.state中
  type State = {
    userInfo: UserInfo
  }

  //webui中响应结果
  type ResponseBody = {
    flag: boolean //是否请求成功
    msg?: string //提示消息
    code: number //响应码
    data?: any //返回数据
  }
}

export { webui }
