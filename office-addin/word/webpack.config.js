/* eslint-disable */
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const srcDir = path.resolve(__dirname, "src");
const distDir = path.resolve(__dirname, "dist");

module.exports = {
  entry: {
    taskpane: path.join(srcDir, "taskpane", "taskpane.ts"),
  },
  output: {
    path: distDir,
    filename: "[name].js",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      // resolve the ../../../../src/officeBridge/... relative imports inside the add-in
      "../../../../src": path.resolve(__dirname, "../../src"),
      "../../../src": path.resolve(__dirname, "../../src"),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: "taskpane.html",
      template: path.join(srcDir, "taskpane", "taskpane.html"),
      chunks: ["taskpane"],
    }),
    new MiniCssExtractPlugin({ filename: "[name].css" }),
  ],
  devServer: {
    port: 3000,
    server: "https",
    hot: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
};
