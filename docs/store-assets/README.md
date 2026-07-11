# 商店素材清单

所有截图必须来自 2.0.1 当前界面，不应包含真实账号、邮箱、头像、浏览器书签、同步密钥、Worker 密钥或私人历史记录。建议使用专门的测试账号或导入合成测试数据。

## 已有素材

- 扩展图标：`public/icon/128.png`（128×128）
- 其他运行时图标：`public/icon/16.png`、`32.png`、`48.png`、`96.png`
- Edge 推荐 Logo：`generated/store-logo-300.png`
- 小型宣传图：`generated/promo-small-440x280.png`
- 大型宣传图：`generated/promo-large-1400x560.png`
- 历史记录截图：`generated/01-history-1280x800.png`
- 分析页截图：`generated/02-analytics-1280x800.png`
- 设置页截图：`generated/03-settings-1280x800.png`

宣传图可以通过 `swift scripts/generate-store-assets.swift` 重新生成。

## 截图内容

以下三张 1280×800 PNG 已去除浏览器外框、黑边和账号标签：

1. `01-history-1280x800.png`：历史记录列表，展示搜索、日期、类型筛选和观看进度。
2. `02-analytics-1280x800.png`：历史记录分析，展示统计卡片和至少两个图表。
3. `03-settings-1280x800.png`：设置页面，展示自动保存、时区、备份和可选云端同步；密钥输入框必须为空。

截图中的扩展名称必须是“哔哩哔哩历史记录保存与分析”。内容应使用不涉及隐私的测试数据。

## 各商店尺寸

### Chrome Web Store

- 图标：128×128，使用 `public/icon/128.png`
- 截图：至少 1 张、最多 5 张，1280×800 或 640×400
- 小型宣传图：440×280
- Marquee 宣传图：1400×560，可选

### Microsoft Edge Add-ons

- Logo：推荐 300×300，最低 128×128
- 截图：最多 6 张，640×480 或 1280×800，可选但强烈建议提供
- 小型宣传图：440×280，可选
- 大型宣传图：1400×560，可选

### Firefox Add-ons

- 使用 128×128 图标
- 建议上传与 Chrome 相同的三张 1280×800 截图
- 为每张图填写简短说明，不要继续使用旧版 1.9.x 截图

### Mac App Store

- Xcode 项目需要完整 App Icon 集合
- App Store Connect 允许的 macOS 截图尺寸会随平台要求更新，以创建版本时后台显示的尺寸为准
- 至少准备记录列表、分析页和设置页三张真实 macOS 截图

## 宣传图文案

标题：哔哩哔哩历史记录保存与分析

副标题：长期保存 · 快速查找 · 观看趋势分析

角标：非官方工具
