# Safari 免费安装指南

Safari 扩展需要放在一个 macOS 应用中，并由 Apple 账户签名。你不需要购买 Apple Developer Program：免费 Apple Account 的 Personal Team 足够在自己的 Mac 上安装和使用。

## 准备工作

1. 安装与你的 macOS 兼容的完整 Xcode。
2. 启动一次 Xcode，完成首次初始化。
3. 打开 **Xcode > Settings > Apple Accounts**。
4. 点击 **Sign In…**，登录自己的 Apple Account。看到 **Personal Team** 即可。
5. 安装 Node.js 24 或更高版本，并启用 Corepack。

## 自动安装

打开“终端”，依次运行：

```bash
git clone https://github.com/rmqg/bilibili-history-sync.git
cd bilibili-history-sync
corepack enable
pnpm install --frozen-lockfile
pnpm safari:install
```

脚本会自动完成 Safari 构建、Xcode 工程转换、Personal Team 签名和本机安装。应用默认安装到 `~/Applications`，不会要求管理员密码。

如果电脑上存在多个开发团队，可以明确指定 Team ID：

```bash
SAFARI_TEAM_ID=你的团队ID pnpm safari:install
```

## 在 Safari 中启用

1. 打开 **Safari > Settings… > Extensions**。
2. 勾选“哔哩哔哩历史记录保存与分析”。
3. 在网站权限中允许访问 `bilibili.com`。
4. 如果工具栏没有图标，右键工具栏，选择 **Customize Toolbar…**，把扩展图标拖到工具栏。
5. 登录哔哩哔哩网页版，点击扩展图标并保存历史记录。

## 更新和续签

进入已克隆的仓库后运行：

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm safari:install
```

脚本会覆盖旧的本机应用。免费签名失效、系统升级或证书变化后，也可以运行同一条命令重新签名。

## 常见问题

### Safari 中出现两个同名扩展

这是安装版本与 Xcode 临时构建同时被 Safari 发现导致的。当前安装脚本会在安装后注销并删除临时构建。退出并重新打开 Safari 设置即可刷新列表。

### 提示没有可用团队

回到 **Xcode > Settings > Apple Accounts** 登录 Apple Account。免费账户显示 **Personal Team** 是正常情况。

### 构建提示 Bundle ID 已被使用

为自己指定一个唯一 Bundle ID 后重试：

```bash
SAFARI_BUNDLE_ID=com.你的名字.bilibili-history pnpm safari:install
```

### 是否可以把这个签名应用发给别人

不建议。Personal Team 适合账户持有人自己的设备。公开分发 Safari 应用需要 Apple Developer Program 和正式分发签名；Chrome、Edge 和 Firefox 版本则通过各自的扩展商店发布。
