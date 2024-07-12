<template>
  <div class="font-bold mt-20px mb-10px">provide and inject using</div>
  <div>{{ title }}</div>

  <div class="mt-20px font-bold mb-10px">Teleport Using</div>
  <!--
     teleport container
     attention: the container must exist when the teleport render
     -->
  <div id="modal-container" />
  <!--  to container-->
  <teleport v-if="modalOpen" to="#modal-container">
    <div class="modal">
      <div>
        to container
        <el-button @click="modalOpen = false">Close</el-button>
      </div>
    </div>
  </teleport>
  <!--  to body-->
  <!--  <teleport v-if="modalOpen" to="body">-->
  <!--    <div>to body</div>-->
  <!--  </teleport>-->
  <el-button @click="showModalOpen">showModalOpen</el-button>
</template>

<script setup lang="ts">
//provide and inject using
const title = inject('title')
const modalOpen = ref(false)
const showModalOpen = () => {
  modalOpen.value = true
}
</script>
