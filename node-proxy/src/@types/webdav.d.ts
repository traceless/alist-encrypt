declare namespace webdav {
  type FileInfo = {
    href: string
    propstat: {
      prop: {
        displayname: string
        getcontentlength?: number
      }
      status: string
    }
  }

  type PropfindResp<T = FileInfo[] | FileInfo> = {
    multistatus: {
      response: T
    }
  }
}

export { webdav }
