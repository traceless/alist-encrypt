<template>
  <div class="mt-10px query-page-style">
    <!--条件搜索-->
    <el-form ref="refSearchForm" :inline="true" :model="searchForm">
      <el-form-item prop="log">
        <el-input v-model="searchForm.log" class="w-150px" placeholder="log" />
      </el-form-item>
      <el-form-item prop="pageUrl">
        <el-input v-model="searchForm.pageUrl" class="w-200px" placeholder="pageUrl" />
      </el-form-item>
      <el-form-item prop="startEndArr">
        <el-date-picker
          v-model="searchForm.startEndArr"
          type="daterange"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD HH:mm:ss"
          class="w-250px"
          range-separator="-"
          start-placeholder="startDate"
          end-placeholder="endDate"
          @change="dateRangePacking"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="resetPageReq">search</el-button>
        <el-button type="primary" @click="resetForm">reset</el-button>
      </el-form-item>
    </el-form>
    <div class="rowES mb-10px">
      <el-button type="primary" @click="multiDelBtnClick">
        <!--        <el-icon style="vertical-align: middle">-->
        <!--          <Delete />-->
        <!--        </el-icon>-->
        <span style="vertical-align: middle">multiDel</span>
      </el-button>
    </div>
    <!--表格和分页-->
    <el-table
      id="resetElementDialog"
      ref="refuserTable"
      :height="`calc(100vh - 260px)`"
      border
      :data="tableListData"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" align="center" width="50" />
      <el-table-column align="center" prop="errorLog" label="错误日志" min-width="250">
        <template #default="{ row }">
          <div class="btn-click-style" @click="copyValueToClipboard(row.errorLog)">{{ row.errorLog }}}</div>
        </template>
      </el-table-column>
      <el-table-column show-overflow-tooltip align="center" prop="pageUrl" label="页面路径" min-width="120" />
      <el-table-column show-overflow-tooltip align="center" prop="version" label="版本号" min-width="80" />
      <el-table-column show-overflow-tooltip align="center" prop="browserType" label="浏览器类型" min-width="120" />
      <el-table-column show-overflow-tooltip align="center" prop="createTime" label="创建时间" min-width="120" />
      <!--点击操作-->
      <el-table-column fixed="right" align="center" label="操作" width="72">
        <template #default="{ row }">
          <div class="table-operation-btn">
            <span @click="tableDelClick(row)">删除</span>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <!--分页-->
    <div v-if="totalPage >= 10" class="rowCC mt-20px">
      <el-pagination
        :current-page="pageNum"
        :page-sizes="[10, 20, 50, 100]"
        :page-size="pageSize"
        layout="total, sizes, prev, pager, next, jumper"
        :total="totalPage"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>
<script setup lang="ts" name="error-collection">
//import { Delete, FolderAdd } from '@element-plus/icons-vue'
import { useTable } from '@/hooks/use-table'
import { copyValueToClipboard } from '@/hooks/use-common'
const searchForm = reactive({
  log: '',
  pageUrl: '',
  startEndArr: ''
})
const selectPageReq = () => {
  const reqConfig = {
    url: '/integration-front/errorCollection/selectPage',
    method: 'get'
  }
  tableListReq(reqConfig).then(({ data }) => {
    tableListData.value = data.records
    totalPage.value = data.total
  })
}
//重置
const refSearchForm = $ref()
const resetForm = () => {
  refSearchForm.resetFields()
  dateRangePacking(['', ''])
  resetPageReq()
}

//批量删除
const multiDelBtnClick = () => {
  const reqConfig = {
    url: '/integration-front/errorCollection/deleteBatchIds',
    method: 'delete',
    bfLoading: true
  }
  multiDelBtnDill(reqConfig)
}

//单个删除
const tableDelClick = (row) => {
  const reqConfig = {
    url: '/integration-front/errorCollection/deleteById',
    params: { id: row.id },
    method: 'delete'
  }
  tableDelDill(row, reqConfig)
}

//添加和修改详情
onMounted(() => {
  selectPageReq()
})

//引入table-query相关的hooks 方法
let {
  pageNum,
  pageSize,
  totalPage,
  tableListData,
  tableListReq,
  dateRangePacking,
  handleSelectionChange,
  handleCurrentChange,
  handleSizeChange,
  resetPageReq,
  multiDelBtnDill,
  tableDelDill
} = useTable(searchForm, selectPageReq)
</script>

<style scoped lang="scss"></style>
