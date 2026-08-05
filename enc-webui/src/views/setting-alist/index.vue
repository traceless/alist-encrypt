<template>
  <div class="scroll-y">
    <h3>Alist服务配置</h3>
    <div v-lang class="mt-30px font-bold mb-10px">服务地址</div>
    <!--条件搜索-->
    <el-form ref="refSearchForm" :label-position="labelPosition" label-width="75px" :model="alistConfigForm">
      <el-form-item prop="username" label="服务器">
        <el-input v-model="alistConfigForm.serverHost" style="max-width: 260px" placeholder="192.168.1.100" />
        <span color="gray" style="font-size: 12px; margin-left: 12px">alist的ip或者域名地址</span>
      </el-form-item>
      <el-form-item prop="password" label="端口">
        <el-input v-model="alistConfigForm.serverPort" style="max-width: 260px" placeholder="5244" />
      </el-form-item>
      <el-form-item prop="https" label="https">
        <el-switch v-model="alistConfigForm.https" class="ml-2" style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" />
        <span color="gray" style="font-size: 12px; margin-left: 12px">默认http</span>
      </el-form-item>
      <div v-lang class="mt-30px font-bold mb-10px">
        密码配置
        <el-button type="success" @click="addPasswd">添加</el-button>
      </div>
      <div
        v-for="(item, index) in alistConfigForm.passwdList"
        :key="item.id"
        style="max-width: 720px; margin: 12px 5px; padding: 10px; border: 1px solid red"
      >
        <span>配置 {{ index + 1 }}</span>
        <el-switch v-model="item.enable" class="mr-2 ml-2" style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" />
        <span >{{item.enable ? '开启' : '已关'}}</span>
        <el-button type="danger" style="margin: 13px" :icon="Delete" circle @click="delPasswd(index)" />
        <el-form-item label="算法">
          <el-radio-group v-model="item.encType" style="margin: 0px 5px" size="small">
            <!-- <el-radio label="mix" border>MIX</el-radio> -->
            <el-radio label="aesctr" border>AES-CTR</el-radio>
            <el-radio label="chacha20" border>CHACHA20</el-radio>
            <el-radio label="rc4" border>RC4(废弃)</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="item.password" style="max-width: 260px; margin-right: 10px" placeholder="12341234" />
        </el-form-item>
        <el-form-item label="目录名">
          加密
          <el-switch
            v-model="item.encFolder"
            class="ml-2"
            style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
          />
          <!-- 后缀
          <el-input v-model="item.encSuffix" style="max-width: 150px; margin-left: 10px" placeholder="默认原文件名后缀" /> -->
        </el-form-item>
        <el-form-item label="文件名">
          加密
          <el-switch v-model="item.encName" class="ml-2" style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" />
          <!-- 后缀
          <el-input v-model="item.encSuffix" style="max-width: 150px; margin-left: 10px" placeholder="默认原文件名后缀" /> -->
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="item.describe" style="max-width: 260px; margin-right: 10px" placeholder="备注描述" />
        </el-form-item>
        <el-form-item label="路径">
          <el-input v-model="item.encPath" style="max-width: 350px; margin-right: 10px" placeholder="多个目录用逗号，隔开" />
          <span color="gray" style="font-size: 13px; margin: 10px">例如: encrypt/.* 正则表达式</span>
        </el-form-item>
        <el-form-item label="子密码:">
          根据子文件夹名 动态切换密码
          <el-button type="success" size="small" style="margin-left: 10px" @click="checkFoldName(item)">获取</el-button>
        </el-form-item>
        <br />
      </div>
      <el-form-item>
        <el-button type="primary" @click="saveAlistConfig">保存</el-button>
      </el-form-item>
      <el-dialog v-model="dialogFolderFormVisible" title="生成文件夹密文" style="min-width: 320px;font-weight: bold">
        <el-tabs v-model="activeName" class="demo-tabs" @tab-click="handleClick">
          <el-tab-pane label="加密名字" name="encode">
            <el-form :model="folderForm">
              <el-form-item prop="folderName" label="文件夹备注">
                <el-input v-model="folderForm.folderName" style="max-width: 260px" placeholder="folder name" />
                <span color="gray" style="font-size: 13px; margin-left: 12px">不能有特殊符号</span>
              </el-form-item>
              <el-form-item prop="enctype" label="算法类型">
                <el-radio-group v-model="folderForm.folderEncType" style="margin: 0 15px" size="small">
                  <!-- <el-radio label="mix" border>MIX</el-radio> -->
                  <el-radio label="aesctr" border>AES-CTR</el-radio>
                  <el-radio label="chacha20" border>chacha20</el-radio>
                  <el-radio label="rc4" border>RC4(废弃)</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item prop="outpasswd" label="子目录密码">
                <el-input v-model="folderForm.folderPasswd" style="max-width: 260px" placeholder="123456" />
              </el-form-item>
              <span style="color: gray;font-size: 12px;">使用下面名字的文件夹，则按此密码进行解密文件</span>
              <el-form-item prop="resultpw" label="文件夹密文">
                {{ folderForm.folderNameEnc }}
              </el-form-item>
              
              <el-button type="success" @click="encodeFoldName">生成</el-button>
            </el-form>
          </el-tab-pane>
          <el-tab-pane label="解密名字" name="decode">
            <el-form :model="folderForm">
              <el-form-item prop="foldername" label="文件夹密文">
                <el-input v-model="folderForm.folderNameEnc" style="max-width: 260px" placeholder="folder name" />
              </el-form-item>
              <el-form-item prop="enctype" label="算法类型">
                {{ folderForm.folderEncType }}
              </el-form-item>
              <el-form-item prop="outpasswd" label="文件夹密码">
                {{ folderForm.folderPasswd }}
              </el-form-item>
              <el-button type="success" @click="decodeFoldName">解密</el-button>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </el-dialog>
    </el-form>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useConfigStore } from '@/store/config'
import { useBasicStore } from '@/store/basic'
import { getAlistConfigReq, saveAlistConfigReq, encodeFoldNameReq, decodeFoldNameReq } from '@/api/user'

import { Check, Delete, Edit, Message, Search, Star, CirclePlus, Folder } from '@element-plus/icons-vue'
import { random } from 'lodash'

const labelPosition = ref('right')
const dialogFolderFormVisible = ref(false)
const activeName = ref('encode')

const basicStore = useBasicStore()
const { settings, userInfo } = basicStore

const { setLanguage } = useConfigStore()
const route = useRoute()
const changeLanguage = (langParam) => {
  setLanguage(langParam)
}
const folderForm = reactive({
  folderName: 'my_video',
  encType: 'aesctr',
  folderPasswd: '123456', // 文件夹密码
  folderNameEnc: '',
  folderEncType: 'aesctr',
  password: '' // base password
})

const alistConfigForm = reactive({
  name: '',
  path: '/*',
  describe: '',
  serverHost: '192.168.1.100',
  serverPort: '5244',
  https: false,
  passwdList: [
    {
      id: Math.random(),
      password: '123456',
      encType: 'aesctr',
      enable: false,
      encName: false, // encrypt file name
      encFolder: false, // encrypt file name
      encSuffix: '', //
      describe: 'my_video',
      encPath: '333'
    }
  ]
})
const refSearchForm = $ref()
// 添加密码配置
const addPasswd = () => {
  alistConfigForm.passwdList.push({
    id: crypto.randomUUID(),
    password: '123456',
    encType: 'aesctr',
    enable: true,
    encName: true, // encrypt file name
    encFolder: false, // encrypt file name
    describe: 'my_video',
    encPath: '/aliyun/encrypt/.*'
  })
}

const delPasswd = (index) => {
  alistConfigForm.passwdList.splice(index, 1)
}
const checkFoldName = (item) => {
  dialogFolderFormVisible.value = true
  folderForm.password = item.password
  folderForm.encType = item.encType
}

const encodeFoldName = async () => {
  const res = await encodeFoldNameReq(folderForm)
  folderForm.folderNameEnc = `${folderForm.folderName}&${res.data.folderNameEnc}`
}

const decodeFoldName = async () => {
  const res = await decodeFoldNameReq(folderForm)
  folderForm.folderPasswd = res.data.folderPasswd
  folderForm.folderEncType = res.data.folderEncType
}

const saveAlistConfig = () => {
  saveAlistConfigReq(alistConfigForm).then((res) => {
    ElMessage.success(res.msg)
  })
}
onMounted(async () => {
  const res = await getAlistConfigReq()
  for (const passwdInfo of res.data.passwdList) {
    passwdInfo.id = Math.random()
    passwdInfo.encPath = passwdInfo.encPath.reduce((a, b) => `${a},${b}`)
  }
  Object.assign(alistConfigForm, res.data)
})
</script>
