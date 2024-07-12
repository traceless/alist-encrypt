<template>
  <div class="scroll-y">
    <h3>Webdav服务配置</h3>
    <br />
    <el-dialog v-model="dialogFormVisible" title="配置信息" style="min-width: 320px">
      <div class="scroll-y">
        <el-form :model="configFormTemp">
          <el-form-item prop="username" label="服务名称">
            <el-input v-model="configFormTemp.name" style="max-width: 260px" placeholder="127.0.0.1" />
          </el-form-item>
          <el-form-item prop="username" label="服务器">
            <el-input v-model="configFormTemp.serverHost" style="max-width: 260px" placeholder="127.0.0.1" />
          </el-form-item>
          <el-form-item prop="password" label="端口">
            <el-input v-model="configFormTemp.serverPort" style="max-width: 260px" placeholder="5244" />
          </el-form-item>
          <el-form-item prop="password" label="主目录">
            <el-input v-model="configFormTemp.path" style="max-width: 260px" placeholder="5244" />
            <span color="gray" style="font-size: 12px; margin-left: 12px">修改后重启生效</span>
          </el-form-item>
          <el-form-item prop="enable" label="开启">
            <el-switch
              v-model="configFormTemp.enable"
              class="ml-2"
              style="margin-bottom: 5px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
            />
          </el-form-item>
          <el-form-item label="密码设置">
            <el-button type="success" @click="addPasswd">添加</el-button>
          </el-form-item>
          <div v-for="(item, index) in configFormTemp.passwdList" :key="item.id">
            <el-radio-group v-model="item.encType" style="margin: 0 25px" size="small">
              <!-- <el-radio label="mix" border>MIX</el-radio> -->
              <el-radio label="rc4" border>RC4</el-radio>
              <el-radio label="aesctr" border>AES-CTR(新)</el-radio>
            </el-radio-group>
            开启
            <el-switch v-model="item.enable" class="ml-2" style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" />
            <el-button type="danger" style="margin: 5px 20px" :icon="Delete" circle @click="delPasswd(index)" />
            <el-form-item label="密码">
              <el-input v-model="item.password" style="max-width: 260px; margin-right: 10px" placeholder="12341234" />
            </el-form-item>
            <el-form-item label="文件名">
              加密
              <el-switch
                v-model="item.encName"
                class="ml-2"
                style="margin-right: 10px; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
              />
              <!-- 后缀
              <el-input v-model="item.encSuffix" style="max-width: 150px; margin-left: 10px" placeholder="默认原文件名后缀" /> -->
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="item.describe" style="max-width: 260px; margin-right: 10px" placeholder="备注描述" />
            </el-form-item>
            <el-form-item label="路径">
              <el-input v-model="item.encPath" style="max-width: 350px; margin-right: 10px" placeholder="多个路径逗号，隔开" />
            </el-form-item>
          </div>
        </el-form>
        <span class="dialog-footer">
          <el-button @click="dialogFormVisible = false">取消</el-button>
          <el-button type="primary" @click="saveWebdavConfig()">保存</el-button>
        </span>
      </div>
    </el-dialog>
    <!-- 列表展示 -->
    <div>
      <el-card v-for="config in configList" :key="config.id" style="width: 250px; margin: 10px; float: left" class="">
        <div class="card-header" style="height: 35px">
          <el-switch
            v-model="config.enable"
            @click="updateWebdavConfig(config)"
            class="ml-2"
            style="float: right; --el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
          />
          <span style="margin-top: 10px">{{ config.name }}</span>
        </div>
        <div class="dark">服务: {{ config.serverHost }}</div>
        <div>端口: {{ config.serverPort }}</div>
        <div>路径: {{ config.path }}</div>
        <div>描述: {{ config.describe }}</div>
        <br />
        <el-button type="danger" size="small" @click="delWebdavConfig(config.id)">删除</el-button>
        <el-button type="primary" size="small" @click="editConfig(config)">编辑</el-button>
      </el-card>
    </div>
    <div style="clear: both">
      <el-button type="success" @click="addConfig">添加配置</el-button>
      <span color="gray" style="font-size: 12px; margin-left: 12px">新增后重启生效</span>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useConfigStore } from '@/store/config'
import { useBasicStore } from '@/store/basic'
import { delWebdavConfigReq, getWebdavConfigReq, saveWebdavConfigReq, updateWebdavConfigReq } from '@/api/user'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Check, Delete, Edit, Message, Search, Star, CirclePlus } from '@element-plus/icons-vue'

const dialogFormVisible = ref(false)
const configList = reactive([])

const configFormTemp = reactive({})
const configTemp = {
  name: 'webdav',
  path: '/webdav/*',
  describe: 'webdav服务',
  serverHost: '192.168.1.100',
  serverPort: '5244',
  https: false,
  enable: true,
  passwdList: [
    {
      id: Math.random(),
      password: '123456',
      encType: 'aesctr',
      enable: false,
      encName: false, // encrypt file name
      encSuffix: '', //
      describe: 'my video',
      encPath: '/aliyun/encrypt/*'
    }
  ]
}
Object.assign(configFormTemp, configTemp)

const refSearchForm = $ref()
// 添加密码配置
const addPasswd = () => {
  configFormTemp.passwdList.push({
    id: Math.random(),
    password: '123456',
    encType: 'aesctr',
    enable: true,
    describe: 'my video',
    encPath: '/dav/encrypt/*'
  })
}

const delPasswd = (index) => {
  configFormTemp.passwdList.splice(index, 1)
}

const editConfig = (config) => {
  dialogFormVisible.value = true
  Object.assign(configFormTemp, config)
}

const addConfig = () => {
  dialogFormVisible.value = true
  Object.assign(configFormTemp, configTemp)
}

const updateWebdavConfig = async (config) => {
  const result = await updateWebdavConfigReq(config)
  dialogFormVisible.value = false
  refreshConfigList(result)
  return
}

const saveWebdavConfig = async () => {
  let result = null
  if (configFormTemp.id) {
    result = await updateWebdavConfigReq(configFormTemp)
  } else {
    result = await saveWebdavConfigReq(configFormTemp)
  }
  dialogFormVisible.value = false
  refreshConfigList(result)
  return
}

const delWebdavConfig = async (id) => {
  ElMessageBox.confirm('Are you sure to delete?').then(async () => {
    const result = await delWebdavConfigReq({ id })
    refreshConfigList(result)
    dialogFormVisible.value = false
    ElMessage(result.msg)
  })
}

const refreshConfigList = async (result) => {
  const res = result || (await getWebdavConfigReq())
  configList.splice(0, configList.length)
  res.data.forEach((element) => {
    const passwdList = element.passwdList
    for (const passwdInfo of passwdList) {
      passwdInfo.id = Math.random()
      // passwdInfo.encPath = passwdInfo.encPath.reduce((a, b) => `${a},${b}`)
    }
    configList.push(element)
  })
}

onMounted(async () => {
  refreshConfigList()
})
</script>
