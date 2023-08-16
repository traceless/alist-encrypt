import CopyPlugin from 'copy-webpack-plugin'
import { resolve } from 'path'
import nodeExternals from 'webpack-node-externals'
import TerserPlugin from 'terser-webpack-plugin'

const output = {
  filename: '[name].js',
  path: resolve('./dist'),
}
export default {
  entry: { index: resolve('./app.js'), PRGAThreadCom: resolve('./src/utils/PRGAThreadCom.js') },
  output,
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: resolve('./public'),
          to: resolve(output.path, 'public'),
        },
      ],
    }),
  ],
  target: 'node',
  externals: [nodeExternals()],
  mode: 'production',
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        // 是否启用多线程
        parallel: true,
        // 是否将注释剥离到单独的文件中
        extractComments: false,
        terserOptions: {
          // 是否压缩代码
          compress: true,
          // 是否压缩标识符
          mangle: true,
          // 是否保留函数名
          keep_fnames: true,
          // 是否保留类名
          keep_classnames: true,
          // format: {
          //   // 输出格式化
          //   beautify: true,
          //   // 保留注释
          //   comments: true,
          // },
        },
      }),
    ],
  },
}
