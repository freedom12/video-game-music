# Video Game Music

游戏音乐浏览播放站点，使用 `pnpm workspace` 管理前后端、共享包和资源工具。

## 结构

- `apps/web`：Vue 3 + Vite + Element Plus 前端
- `apps/api`：Fastify API，负责专辑、搜索、播放流和后台接口
- `packages/shared`：共享类型、校验和纯函数
- `packages/core`：SQLite、导入、媒体解析、COS 同步核心逻辑
- `tools/media-importer`：本地资源入库 CLI
- `tools/media-sync`：腾讯云 COS 同步 CLI

## 本地开发

1. 复制 `.env.example` 为 `.env`
2. 明确填写 `MEDIA_LIBRARY_ROOT`
3. 安装依赖：`pnpm install`
4. 启动前后端：`pnpm dev`

默认 API 监听 `http://127.0.0.1:8787`，前端开发服务器监听 `http://localhost:5173`。SQLite 数据库默认写入 `./var/video-game-music.sqlite`，不依赖外部数据库服务。

注意：

- `.env` 文件不存在时，应用会直接报错退出
- `MEDIA_LIBRARY_ROOT` 未配置时，应用会直接报错退出
- 不再对本地音乐目录使用任何默认回退路径

## 资源导入

- 执行入库：`pnpm import:commit`
- 上传 COS：`pnpm sync:cos`

开发环境下，播放器通过 API 直接读取 `MEDIA_LIBRARY_ROOT` 下的本地文件，不需要先上传资源。
