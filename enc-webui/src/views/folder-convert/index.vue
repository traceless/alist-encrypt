<template>
  <div class="scroll-y">
    <h3 class="mb-20px">文件转存功能（即将上线）</h3>
    <div class="rowSS">文件转存，可以把任意的网盘文件转到加密文件夹中，建议1G内的文件使用</div>
    <div class="rowSS">大文件推荐使用本地加密后，再从云盘客户端上进行上传，比较可靠</div>
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
        <div class="el-upload__tip">即将上线</div>
      </template>
    </el-upload>
  </div>
</template>

<script setup>
const { settings } = storeToRefs(useBasicStore())
</script>
