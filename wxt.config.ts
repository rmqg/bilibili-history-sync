import { defineConfig } from "wxt";

const escapeNonAscii = (value: string) =>
  value.replace(/[^\x00-\x7F]/g, (char) => {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) return char;
    if (codePoint <= 0xffff) return `\\u${codePoint.toString(16).padStart(4, "0")}`;
    return `\\u{${codePoint.toString(16)}}`;
  });

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [
      {
        name: "escape-non-ascii-js",
        generateBundle(_options, bundle) {
          for (const output of Object.values(bundle)) {
            if (output.type === "chunk") {
              output.code = escapeNonAscii(output.code);
            }
          }
        },
      },
    ],
  }),
  manifest: ({ browser }) => ({
    name: "哔哩哔哩历史记录保存与分析",
    short_name: "历史保存与分析",
    description: "非官方工具：保存哔哩哔哩历史记录，并分析观看进度、视频时长、分区和 UP 主",
    homepage_url: "https://github.com/rmqg/bilibili-history-sync",
    permissions: ["storage", "cookies", "alarms"],
    host_permissions: ["*://bilibili.com/*", "*://*.bilibili.com/*"],
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "bilibili-history-sync@rmqg.org",
              strict_min_version: "140.0",
              data_collection_permissions: {
                required: ["none"],
                optional: ["authenticationInfo", "browsingActivity"],
              },
            },
            gecko_android: {
              strict_min_version: "142.0",
            },
          },
        }
      : {}),
  }),
  zip: {
    artifactTemplate: "{{name}}-{{version}}-{{browser}}.zip",
    sourcesTemplate: "{{name}}-{{version}}-sources.zip",
  },
});
