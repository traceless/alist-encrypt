<template>
  <div class="scroll-y">
    <h3 class="mb-20px">功能</h3>
    <div class="rowSS">文件转存，可以把任意文件转到加密文件夹中，建议1G内的文件使用</div>
    <el-upload
      v-model:file-list="fileList"
      class="upload-demo"
      action="/enc-api/encryptFile"
      multiple
      :on-preview="handlePreview"
      :on-remove="handleRemove"
      :before-remove="beforeRemove"
      :limit="3"
      :on-exceed="handleExceed"
    >
      <el-button type="primary">Click to upload</el-button>
      <template #tip>
        <div class="el-upload__tip">jpg/png files with a size less than 500KB.</div>
      </template>
    </el-upload>
  </div>
</template>

<script setup>
const { settings } = storeToRefs(useBasicStore())
</script>
