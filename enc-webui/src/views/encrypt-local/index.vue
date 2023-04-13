<template>
  <div class="scroll-y">
    <h3>本地加解密</h3>
    <div v-lang class="mt-30px font-bold mb-10px">使用说明：</div>
    <div v-lang class="">此功能可以讲encrypt所在的系统中的文件夹进行加密，选择要加密文件夹的路径，然后点击 加密\解密 按钮即可</div>
    <!--条件搜索-->
    <el-form ref="refSearchForm" :label-position="labelPosition" label-width="75px" :model="folderForm">
      <div v-lang class="mt-30px font-bold mb-10px">密码设置</div>
      <el-form-item label="操作">
        <el-radio-group v-model="folderForm.operation" size="small">
          <!-- <el-radio label="mix" border>MIX</el-radio> -->
          <el-radio label="enc" border>加密</el-radio>
          <el-radio label="dec" border>解密</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="算法">
        <el-radio-group v-model="folderForm.encType" size="small">
          <!-- <el-radio label="mix" border>MIX</el-radio> -->
          <el-radio label="aesctr" border>AES-CTR</el-radio>
          <el-radio label="rc4" border>RC4</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="folderForm.password" style="max-width: 260px; margin-right: 10px" placeholder="12341234" />
      </el-form-item>
      <el-form-item v-if="folderForm.operation == 'enc'" label="文件名">
        加密
        <el-switch
          v-model="folderForm.encName"
          class="ml-2"
          style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
        />
      </el-form-item>
      <el-form-item label="文件夹">
        <el-input v-model="folderForm.folderPath" style="max-width: 260px; margin-right: 10px" placeholder="/home/test" />
        <el-button type="success" size="small" style="margin-left: 10px" @click="checkFoldName('item')">选择</el-button>
      </el-form-item>
      <el-form-item>
        <el-button v-if="folderForm.operation == 'enc'" type="primary" @click="encryptFile">加密</el-button>
        <el-button v-if="folderForm.operation == 'dec'" type="success" @click="encryptFile">解密</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
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
  folderPath: '/home/test_enc',
  encType: 'aesctr',
  password: '123456', // 文件夹密码
  operation: 'enc',
  encName: false
})

const alistConfigForm = reactive({})
const refSearchForm = $ref()

const delPasswd = (index) => {
  alistConfigForm.passwdList.splice(index, 1)
}

const saveAlistConfig = () => {
  saveAlistConfigReq(alistConfigForm)
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
