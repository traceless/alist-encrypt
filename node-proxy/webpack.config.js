import CopyPlugin from 'copy-webpack-plugin'
import { resolve } from 'path'
import nodeExternals from 'webpack-node-externals'

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
  optimization: { minimize: false },
}
