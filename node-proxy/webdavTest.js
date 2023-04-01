import { createClient } from 'webdav'

const url = 'http://192.168.8.21:5344/dav/aliyun'
const client = createClient(url, {
  username: 'admin',
  password: 'YiuNH7ly'
})

const start = async function () {
  const directoryItems = await client.getDirectoryContents('/')
  console.log('directoryItems', directoryItems)
}

start()
