declare namespace alist {
  //alist中的文件类型
  export enum FileType {
    UNKNOWN,
    FOLDER,
    // OFFICE,
    VIDEO,
    AUDIO,
    TEXT,
    IMAGE,
  }

  //alist中的文件属性
  export interface FileInfo {
    name: string
    size: number
    is_dir: boolean
    modified: string
    created: string
    sign: string
    thumb: string
    type: FileType
    hash_info: string | null

    path?: string //非原生属性，由proxy添加
  }

  //alist中的 /api/fs/get 的请求体
  type FsGetRequestBody = {
    path: string
    password: string
  }

  //alist中的 /api/fs/list 的请求体
  type FsListRequestBody = {
    path: string
    password: string
    page: number
    per_page: number
    refresh: boolean
  }

  //alist中的 /api/fs/remove 的请求体
  type FsRemoveRequestBody = {
    dir: string
    names: string[]
  }

  //alist中的 /api/fs/move 的请求体
  type FsMoveRequestBody = {
    src_dir: string
    dst_dir: string
    names: string[]
  }

  //alist中的 /api/fs/copy 的请求体
  type FsCopyRequestBody = {
    src_dir: string
    dst_dir: string
    names: string[]
  }

  //alist中的 /api/fs/rename 的请求体
  type FsRenameRequestBody = {
    path: string
    name: string
  }

  //alist中的响应结构
  export interface Resp<T> {
    code: number
    message: string
    data: T
  }

  //alist中的 /api/fs/list 的响应体
  type FsListResponseBody = Resp<{
    content: FileInfo[] | null
    total: number
    readme: string
    header: string
    write: boolean
    provider: string
  }>
}

export { alist }
