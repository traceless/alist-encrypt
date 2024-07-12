<template>
  <div class="scroll-y">
    <div v-lang class="mt-10px mb-10px font-bold">主题切换</div>
    <el-button @click="setTheme('lighting-theme')">lighting-theme</el-button>
    <el-button @click="setTheme('dark')">dark-theme</el-button>
    
    <!-- <el-button @click="setTheme('base-theme')">base-theme(default)</el-button>
    <el-button @click="setTheme('lighting-theme')">lighting-theme</el-button>
    <el-button @click="setTheme('china-red')">china-red(default)</el-button>
    <el-button @click="setTheme('dark')">dark-theme</el-button> -->

    <div v-lang class="mt-10px mb-10px font-bold">switch language</div>
    <el-button @click="changeLanguage('en')">en</el-button>
    <el-button @click="changeLanguage('zh')">zh</el-button>

    <div v-lang class="mt-30px font-bold mb-10px">账号设置</div>
    <!--条件搜索-->
    <el-form ref="refSearchForm" :label-position="labelPosition" label-width="60px" :model="userForm">
      <el-form-item prop="username" label="用户名">
        <el-input v-model="userForm.username" disabled="true" style="max-width: 260px" placeholder="username" />
      </el-form-item>
      <el-form-item prop="password" label="原密码">
        <el-input v-model="userForm.password" style="max-width: 260px" type="password" placeholder="password" />
      </el-form-item>
      <el-form-item prop="newpassword" label="新密码">
        <el-input v-model="userForm.newpassword" style="max-width: 260px" type="password" placeholder="password" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="updatePasswd">修改</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useConfigStore } from '@/store/config'
import { useBasicStore } from '@/store/basic'
import { upatePasswordReq } from '@/api/user'

const labelPosition = ref('right')

const basicStore = useBasicStore()
const { settings, userInfo } = basicStore

const { setTheme, theme, setSize, size, setLanguage } = useConfigStore()
setSize('default')
// setTheme('dark')
const changeLanguage = (langParam) => {
  setLanguage(langParam)
}

const userForm = reactive({
  username: '',
  password: '',
  newpassword: ''
})
const refSearchForm = $ref()
userForm.username = userInfo.username

const updatePasswd = () =>{
  upatePasswordReq(userForm)
}

</script>
