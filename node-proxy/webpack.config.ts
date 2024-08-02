import fs from 'fs'
import CopyPlugin from 'copy-webpack-plugin'
import path from 'path'
import TerserPlugin from 'terser-webpack-plugin'
import webpack from 'webpack'

const output = {
  filename: '[name].js',
  path: path.resolve('./dist'),
}
export default () => {
  return <webpack.Configuration>{
    entry: { index: path.resolve('./app.ts'), PRGAThreadCom: path.resolve('./src/utils/PRGAThreadCom.js') },
    output,
    module: {
      rules: [
        {
          test: /\.[tj]s$/i,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true, // 只做语言转换，而不做类型检查
              },
            },
          ],
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@': path.resolve('./src'),
      },
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          {
            from: path.resolve('./public'),
            to: path.join(output.path, 'public'),
          },
        ],
      }),
      new PkgConfig(),
    ],
    target: 'node',
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
}

class PkgConfig {
  apply(compiler: webpack.Compiler) {
    compiler.hooks.afterEmit.tap('PkgConfig', () => {
      const conf = JSON.parse(fs.readFileSync(path.resolve('./package.json'), 'utf-8'))
      const pkg_conf = JSON.parse(fs.readFileSync(path.resolve('./pkgconfig.dist.json'), 'utf-8'))
      pkg_conf['name'] = conf['name']
      pkg_conf['version'] = conf['version']
      const pkg_conf_path = path.join(output.path, 'package.json')
      fs.writeFileSync(pkg_conf_path, JSON.stringify(pkg_conf), { encoding: 'utf-8' })
      console.log(pkg_conf_path, pkg_conf)
    })
  }
}
