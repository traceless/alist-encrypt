import { markRaw, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, test } from 'vitest'
import { Loading, Search } from '@element-plus/icons-vue'

import ElSvgIcon from '../ElSvgIcon.vue'

// const AXIOM = 'Rem is the best girl'

describe('ElSvgIcon.vue', () => {
  it('create', () => {
    const wrapper = mount(() => <ElSvgIcon name="Edit" size={30} color={'red'} />)

    // console.log(111111, wrapper.classes())
    // expect(wrapper.classes()).toContain('el-icon')
  })

  // it('icon', () => {
  //   const wrapper = mount(() => <ElSvgIcon icon={markRaw(Search)} />)
  //   expect(wrapper.findAll('Search11222')).toBeTruthy()
  // })
  //
  // it('size', () => {
  //   const wrapper = mount(() => <ElSvgIcon size="20px" />)
  //   expect(wrapper.findAll('20px')).toBeTruthy()
  // })
  //
  // it('color', () => {
  //   const wrapper = mount(() => <ElSvgIcon color={'red'} />)
  //   expect(wrapper.findAll('red')).toBeTruthy()
  // })
  //
  // it('nativeType', () => {
  //   const wrapper = mount(() => <ElSvgIcon nativeType="submit" />)
  //
  //   expect(wrapper.attributes('type')).toBe('submit')
  // })
  //
  // it('loading', () => {
  //   const wrapper = mount(() => <ElSvgIcon loading />)
  //
  //   expect(wrapper.classes()).toContain('is-loading')
  //   expect(wrapper.findComponent(Loading).exists()).toBeTruthy()
  // })
  //
  // it('size', () => {
  //   const wrapper = mount(() => <ElSvgIcon size="large" />)
  //
  //   expect(wrapper.classes()).toContain('el-button--large')
  // })
  //
  // it('plain', () => {
  //   const wrapper = mount(() => <ElSvgIcon plain />)
  //
  //   expect(wrapper.classes()).toContain('is-plain')
  // })
  //
  // it('round', () => {
  //   const wrapper = mount(() => <ElSvgIcon round />)
  //   expect(wrapper.classes()).toContain('is-round')
  // })
  //
  // it('circle', () => {
  //   const wrapper = mount(() => <ElSvgIcon circle />)
  //
  //   expect(wrapper.classes()).toContain('is-circle')
  // })

  // it('text', async () => {
  //   const bg = ref(false)
  //
  //   const wrapper = mount(() => <ElSvgIcon text bg={bg.value} />)
  //
  //   expect(wrapper.classes()).toContain('is-text')
  //
  //   bg.value = true
  //
  //   await nextTick()
  //
  //   expect(wrapper.classes()).toContain('is-has-bg')
  // })

  // it('link', async () => {
  //   const wrapper = mount(() => <ElSvgIcon link />)
  //
  //   expect(wrapper.classes()).toContain('is-link')
  // })

  // test('render text', () => {
  //   const wrapper = mount(() => (
  //     <ElSvgIcon
  //       v-slots={{
  //         default: () => AXIOM
  //       }}
  //     />
  //   ))
  //
  //   expect(wrapper.text()).toEqual(AXIOM)
  // })
  //
  // test('handle click', async () => {
  //   const wrapper = mount(() => (
  //     <ElSvgIcon
  //       v-slots={{
  //         default: () => AXIOM
  //       }}
  //     />
  //   ))
  //
  //   await wrapper.trigger('click')
  //   expect(wrapper.emitted()).toBeDefined()
  // })
  //
  // test('handle click inside', async () => {
  //   const wrapper = mount(() => (
  //     <ElSvgIcon
  //       v-slots={{
  //         default: () => <span class="inner-slot"></span>
  //       }}
  //     />
  //   ))
  //
  //   wrapper.find('.inner-slot').trigger('click')
  //   expect(wrapper.emitted()).toBeDefined()
  // })
  //
  // test('loading implies disabled', async () => {
  //   const wrapper = mount(() => (
  //     <ElSvgIcon
  //       v-slots={{
  //         default: () => AXIOM
  //       }}
  //       loading
  //     />
  //   ))
  //
  //   await wrapper.trigger('click')
  //   expect(wrapper.emitted('click')).toBeUndefined()
  // })
  //
  // it('disabled', async () => {
  //   const wrapper = mount(() => <ElSvgIcon disabled />)
  //
  //   expect(wrapper.classes()).toContain('is-disabled')
  //   await wrapper.trigger('click')
  //   expect(wrapper.emitted('click')).toBeUndefined()
  // })
  //
  // it('loading icon', () => {
  //   const wrapper = mount(() => <ElSvgIcon loadingIcon={markRaw(Search)} loading />)
  //
  //   expect(wrapper.findComponent(Search).exists()).toBeTruthy()
  // })
  //
  // it('loading slot', () => {
  //   const wrapper = mount({
  //     setup: () => () => (
  //       <ElSvgIcon v-slots={{ loading: () => <span class="custom-loading">111</span> }} loading={true}>
  //         Loading
  //       </ElSvgIcon>
  //     )
  //   })
  //
  //   expect(wrapper.find('.custom-loading').exists()).toBeTruthy()
  // })
})
// describe('ElSvgIcon Group', () => {
//   it('create', () => {
//     const wrapper = mount({
//       setup: () => () =>
//         (
//           <ButtonGroup>
//             <ElSvgIcon type="primary">Prev</ElSvgIcon>
//             <ElSvgIcon type="primary">Next</ElSvgIcon>
//           </ButtonGroup>
//         )
//     })
//     expect(wrapper.classes()).toContain('el-button-group')
//     expect(wrapper.findAll('button').length).toBe(2)
//   })
//
//   it('button group reactive size', async () => {
//     const size = ref<ComponentSize>('small')
//     const wrapper = mount({
//       setup: () => () =>
//         (
//           <ButtonGroup size={size.value}>
//             <ElSvgIcon type="primary">Prev</ElSvgIcon>
//             <ElSvgIcon type="primary">Next</ElSvgIcon>
//           </ButtonGroup>
//         )
//     })
//     expect(wrapper.classes()).toContain('el-button-group')
//     expect(wrapper.findAll('.el-button-group button.el-button--small').length).toBe(2)
//
//     size.value = 'large'
//     await nextTick()
//
//     expect(wrapper.findAll('.el-button-group button.el-button--large').length).toBe(2)
//   })
//
//   it('button group type', async () => {
//     const wrapper = mount({
//       setup: () => () =>
//         (
//           <ButtonGroup type="warning">
//             <ElSvgIcon type="primary">Prev</ElSvgIcon>
//             <ElSvgIcon>Next</ElSvgIcon>
//           </ButtonGroup>
//         )
//     })
//     expect(wrapper.classes()).toContain('el-button-group')
//     expect(wrapper.findAll('.el-button-group button.el-button--primary').length).toBe(1)
//     expect(wrapper.findAll('.el-button-group button.el-button--warning').length).toBe(1)
//   })
//
//   it('add space in two Chinese characters', async () => {
//     const wrapper = mount(() => (
//       <ElSvgIcon
//         v-slots={{
//           default: () => '中文'
//         }}
//         autoInsertSpace
//       />
//     ))
//
//     expect(wrapper.find('.el-button span').text()).toBe('中文')
//     expect(wrapper.find('.el-button span').classes()).toContain('el-button__text--expand')
//   })
//
//   it('add space between two Chinese characters even if there is whitespace at both ends', async () => {
//     const wrapper = mount(() => <ElSvgIcon autoInsertSpace>&nbsp;中文&nbsp;</ElSvgIcon>)
//
//     expect(wrapper.find('.el-button span').text()).toBe('中文')
//     expect(wrapper.find('.el-button span').classes()).toContain('el-button__text--expand')
//   })
// })
