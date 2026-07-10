# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

哔哩哔哩历史记录保存与分析是一个基于 [WXT](https://wxt.dev/) + React 19 + TailwindCSS 3 的浏览器扩展，用于获取、保存、检索、导入导出和分析哔哩哔哩历史记录。

项目当前只保留历史记录主线。不要重新引入与历史记录采集、保存、检索、导入导出和分析无关的页面或后台逻辑，除非用户明确要求。

## 常用命令

```bash
pnpm install
pnpm dev
pnpm dev:firefox
pnpm compile
pnpm format:check
pnpm build
pnpm build:safari
pnpm build:firefox
```

仓库未配置测试框架；改动后至少运行 `pnpm compile` 和 `pnpm format:check`。涉及构建入口或 manifest 时同时运行 `pnpm build`、`pnpm build:safari` 和 `pnpm build:firefox`。

## 架构

WXT 按目录约定生成扩展入口，所有入口共享同一个 IndexedDB 数据库 `bilibiliHistory` 和 `browser.storage.local` 配置。

### Entrypoints

| 入口                                                   | 作用                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| [entrypoints/background.ts](entrypoints/background.ts) | 调用 Bilibili 历史接口，执行增量/全量同步，处理定时 alarm 和 cookie 读取 |
| [entrypoints/my-history/](entrypoints/my-history/)     | 主页面，包含历史记录页、记录分析页和设置页                               |
| [entrypoints/popup/](entrypoints/popup/)               | 浏览器弹窗，提供打开历史页、同步历史、全量同步开关                       |

manifest 在 [wxt.config.ts](wxt.config.ts) 声明。权限应尽量保持在历史记录功能所需范围内：`storage`、`cookies`、`alarms`，host permissions 仅覆盖 Bilibili 域名。

扩展对 Bilibili 只读。不要添加注入脚本、删除接口、删除联动或本地历史删除入口，除非用户明确改变这个约束。

### 数据层

[utils/db.ts](utils/db.ts) 管理 IndexedDB：

- DB name: `bilibiliHistory`
- version: `7`
- store: `history`，保存每个内容的最新记录，keyPath: `id`，index: `view_at`
- store: `watchEvents`，保存每次观察到的观看事件，keyPath: `event_id`，indexes: `view_at`、`history_id`、`business`

schema 变更必须提升 `DB_CONFIG.version`，并在 `onupgradeneeded` 里处理迁移。当前 v7 会删除旧版本遗留的非历史记录 store，并把旧 `history` 记录迁移为初始观看事件。

### 前端

路由由 [entrypoints/my-history/App.tsx](entrypoints/my-history/App.tsx) 定义：

- `/` -> [pages/History.tsx](pages/History.tsx)
- `/analytics` -> [pages/Analytics.tsx](pages/Analytics.tsx)
- `/settings` -> [pages/Settings.tsx](pages/Settings.tsx)

侧边栏在 [components/Sidebar.tsx](components/Sidebar.tsx)。新增页面时需要同时更新路由和侧边栏，但应先确认它是否符合“历史记录采集/保存/分析”主线。

### 存储键

所有 `browser.storage.local` key 集中在 [utils/constants.ts](utils/constants.ts)。读写优先使用 [utils/storage.ts](utils/storage.ts) 的 `getStorageValue<T>` / `setStorageValue<T>`。

## 风格约定

- Prettier 配置见 [.prettierrc](.prettierrc)：100 列、双引号、尾随逗号、`arrowParens: always`。
- TypeScript 类型以 `pnpm compile` 为准。
- 共享类型集中在 [utils/types/index.ts](utils/types/index.ts)。
- UI 保持简洁工具型风格，避免重新加入和历史记录无关的入口。
