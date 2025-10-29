const path = require('path');
const pkg = require('./package.json');

module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    library: pkg.name,
    libraryTarget: 'umd',
    globalObject: 'this',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.build.json'
          }
        },
        exclude: [
          /node_modules/,
          /\.test\.ts$/,
          /\.spec\.ts$/,
          /__tests__/,
        ],
      },
      {
        test: /\.(js)$/,
        exclude: [
          /node_modules/,
          /\.test\.js$/,
          /\.spec\.js$/,
          /__tests__/,
        ],
        use: {
          loader: "babel-loader",
        },
      },
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  target: 'node',
  externals: {
    react: 'react',
    'react-dom': 'react-dom',
    zustand: 'zustand',
    axios: 'axios',
  },
};
