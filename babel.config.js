module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": "./",
          },
          extensions: [
            ".ios.js",
            ".android.js",
            ".js",
            ".jsx",
            ".json",
            ".tsx",
            ".ts",
          ],
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};