# Video Game Music API 文档

本文档描述了 Video Game Music 后端服务提供的所有 REST API 接口。

- **默认端口**：`5005`（可通过环境变量 `API_PORT` 修改）
- **Base URL**：`http://localhost:5005`
- **数据格式**：所有请求和响应均使用 `application/json`（媒体流和图片接口除外）

---

## 目录

- [系统](#系统)
- [乐曲 Tracks](#乐曲-tracks)
- [专辑 Albums](#专辑-albums)
- [系列 Series](#系列-series)
- [合集 Collections](#合集-collections)
- [媒体资源](#媒体资源)
- [搜索](#搜索)
- [管理接口（需鉴权）](#管理接口需鉴权)

---

## 系统

### GET /api/health

健康检查接口，用于确认服务是否正常运行。

**响应示例**

```json
{ "ok": true }
```

---

## 乐曲 Tracks

### GET /api/tracks/search

**按标题及多维条件搜索乐曲，返回结果包含可直接使用的流媒体 URL 和封面 URL。**

这是核心数据查询接口，适用于播放器前端的搜索场景。

#### 查询参数

| 参数       | 类型     | 必填 | 说明                                             |
| ---------- | -------- | ---- | ------------------------------------------------ |
| `q`          | `string` | 否   | 按曲目**标题**关键词模糊搜索（同时匹配展示标题） |
| `album`      | `string` | 否   | 按**专辑名称**关键词模糊筛选                     |
| `artist`     | `string` | 否   | 按**艺术家**名称关键词模糊筛选                   |
| `genre`      | `string` | 否   | 按**流派**关键词模糊筛选                         |
| `year`       | `number` | 否   | 按**发行年份**精确筛选                           |
| `seriesId`   | `string` | 否   | 按**系列** `publicId` 精确筛选                   |
| `discNumber` | `number` | 否   | 按**碟片号**精确筛选                             |
| `trackNumber`| `number` | 否   | 按**曲目号**精确筛选                             |
| `limit`      | `number` | 否   | 每页返回数量，默认 `20`，最大 `100`              |
| `offset`     | `number` | 否   | 分页偏移量，默认 `0`                             |

> 所有参数均可组合使用，多个条件取交集（AND）。若所有参数均为空，则返回全部曲目。

#### 响应结构

```json
{
  "items": [
    {
      "publicId": "01960b2a-...",
      "title": "Battle Tower",
      "artist": "Go Ichinose",
      "durationSeconds": 183,
      "trackNumber": 5,
      "discNumber": 1,
      "discTitle": null,
      "mediaAssetId": "01960b2a-...",
      "albumId": "01960a11-...",
      "albumTitle": "Pokémon Diamond & Pearl Super Music Collection",
      "albumArtist": "Go Ichinose / Hitomi Sato",
      "year": 2007,
      "genre": "Game",
      "streamUrl": "http://localhost:5005/api/tracks/01960b2a-.../stream",
      "coverUrl": "http://localhost:5005/api/assets/01960a11-.../cover"
    }
  ],
  "total": 128,
  "limit": 20,
  "offset": 0
}
```

#### 字段说明

| 字段              | 类型               | 说明                                               |
| ----------------- | ------------------ | -------------------------------------------------- |
| `publicId`        | `string`           | 曲目唯一 ID                                        |
| `title`           | `string`           | 曲目展示标题（已优先使用自定义标题）               |
| `artist`          | `string`           | 艺术家展示名称                                     |
| `durationSeconds` | `number`           | 时长（秒）                                         |
| `trackNumber`     | `number`           | 曲目编号                                           |
| `discNumber`      | `number`           | 碟号                                               |
| `discTitle`       | `string \| null`   | 分碟标题（如有）                                   |
| `mediaAssetId`    | `string`           | 对应媒体资产 ID                                    |
| `albumId`         | `string \| null`   | 所属专辑 ID（曲目可能不属于任何专辑）              |
| `albumTitle`      | `string \| null`   | 所属专辑名称                                       |
| `albumArtist`     | `string \| null`   | 专辑艺术家                                         |
| `year`            | `number \| null`   | 发行年份                                           |
| `genre`           | `string \| null`   | 流派                                               |
| `streamUrl`       | `string`           | **音频流 URL**，可直接用于 `<audio src>` 或播放器 |
| `coverUrl`        | `string \| null`   | **封面图片 URL**，可直接用于 `<img src>`           |

#### 示例请求

```
# 搜索标题包含 "battle" 的曲目
GET /api/tracks/search?q=battle

# 搜索属于某专辑、由特定艺术家创作的曲目
GET /api/tracks/search?album=Diamond&artist=Ichinose

# 搜索特定系列下2006年发行的所有曲目（分页）
GET /api/tracks/search?seriesId=01960a00-...&year=2006&limit=50&offset=0

# 获取某专辑第2碟的所有曲目
GET /api/tracks/search?album=Diamond&discNumber=2

# 获取某专辑第1碟第3首曲目
GET /api/tracks/search?albumId=01960a11-...&discNumber=1&trackNumber=3
```

---

### GET /api/tracks/:id

获取单首曲目的完整元数据信息。

#### 路径参数

| 参数 | 类型     | 说明           |
| ---- | -------- | -------------- |
| `id` | `string` | 曲目 publicId  |

#### 响应示例

```json
{
  "publicId": "01960b2a-...",
  "mediaAssetId": "01960b2a-...",
  "title": "Battle Tower",
  "artist": "Go Ichinose",
  "durationSeconds": 183,
  "format": "mp3",
  "year": 2007,
  "genre": "Game",
  "sourceMeta": {
    "title": "Battle Tower",
    "album": "Pokémon Diamond & Pearl Super Music Collection",
    "artist": "Go Ichinose",
    "albumArtist": "Go Ichinose / Hitomi Sato",
    "year": 2007,
    "trackNumber": 5,
    "discNumber": 1
  },
  "displayTitle": null,
  "displayArtist": null,
  "hidden": false,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### 错误响应

| 状态码 | 说明         |
| ------ | ------------ |
| `404`  | 曲目不存在   |

---

### GET /api/tracks/:id/stream

获取曲目的音频流。支持 HTTP Range 请求（`206 Partial Content`），可用于音频 seek。

- 若媒体源为本地文件，直接返回音频流
- 若媒体源为对象存储（COS），返回 `302` 重定向至临时签名 URL

#### 响应

| Content-Type        | 说明              |
| ------------------- | ----------------- |
| `audio/mpeg`        | MP3 格式          |
| `audio/flac`        | FLAC 格式         |
| `audio/*`           | 其他音频格式      |

支持请求头：`Range: bytes=0-1023`

#### 错误响应

| 状态码 | 说明              |
| ------ | ----------------- |
| `404`  | 曲目不存在        |

---

### GET /api/tracks/:id/embedded-cover

获取曲目音频文件内嵌的封面图片（从 ID3 标签等元数据中提取）。

- 返回 `512×512` PNG 格式
- 若文件无内嵌封面，返回 `404`
- 响应包含 `Cache-Control: public, max-age=86400` 缓存头

#### 响应

`Content-Type: image/png`

#### 错误响应

| 状态码 | 说明               |
| ------ | ------------------ |
| `404`  | 无内嵌封面         |

---

## 专辑 Albums

### GET /api/albums/search

**按标题及多维条件搜索专辑，返回结果包含封面 URL。**

#### 查询参数

| 参数       | 类型     | 必填 | 说明                                             |
| ---------- | -------- | ---- | ------------------------------------------------ |
| `q`        | `string` | 否   | 按专辑**标题**关键词模糊搜索（同时匹配展示标题） |
| `artist`   | `string` | 否   | 按**专辑艺术家**名称关键词模糊筛选               |
| `genre`    | `string` | 否   | 按曲目**流派**关键词模糊筛选                     |
| `year`     | `number` | 否   | 按**发行年份**精确筛选                           |
| `seriesId` | `string` | 否   | 按**系列** `publicId` 精确筛选                   |
| `limit`    | `number` | 否   | 每页返回数量，默认 `20`，最大 `100`              |
| `offset`   | `number` | 否   | 分页偏移量，默认 `0`                             |

> 所有参数均可组合使用，多个条件取交集（AND）。若所有参数均为空，则返回全部专辑。

#### 响应结构

```json
{
  "items": [
    {
      "publicId": "01960a11-...",
      "title": "Pokémon Diamond & Pearl Super Music Collection",
      "albumArtist": "Go Ichinose / Hitomi Sato",
      "year": 2007,
      "trackCount": 158,
      "discCount": 4,
      "seriesId": "01960a00-...",
      "seriesName": "Pokémon",
      "coverUrl": "http://localhost:5005/api/assets/01960a11-.../cover"
    }
  ],
  "total": 32,
  "limit": 20,
  "offset": 0
}
```

#### 字段说明

| 字段           | 类型             | 说明                                         |
| -------------- | ---------------- | -------------------------------------------- |
| `publicId`     | `string`         | 专辑唯一 ID                                  |
| `title`        | `string`         | 专辑展示标题（已优先使用自定义标题）         |
| `albumArtist`  | `string`         | 专辑艺术家展示名称                           |
| `year`         | `number \| null` | 发行年份                                     |
| `trackCount`   | `number`         | 曲目数量                                     |
| `discCount`    | `number`         | 碟数                                         |
| `seriesId`     | `string \| null` | 所属系列 ID                                  |
| `seriesName`   | `string \| null` | 所属系列名称                                 |
| `coverUrl`     | `string \| null` | **封面图片 URL**，可直接用于 `<img src>`     |

#### 示例请求

```
# 搜索标题包含 "diamond" 的专辑
GET /api/albums/search?q=diamond

# 搜索特定艺术家的专辑
GET /api/albums/search?artist=Junichi+Masuda

# 搜索特定系列下2006年的专辑
GET /api/albums/search?seriesId=01960a00-...&year=2006
```

---

### GET /api/albums

获取所有专辑列表，按标题排序。

#### 响应示例

```json
[
  {
    "publicId": "01960a11-...",
    "title": "Pokémon Diamond & Pearl Super Music Collection",
    "albumArtist": "Go Ichinose / Hitomi Sato",
    "year": 2007,
    "trackCount": 158,
    "discCount": 4
  }
]
```

---

### GET /api/albums/:id

获取专辑详情，包含完整曲目列表。

#### 路径参数

| 参数 | 类型     | 说明           |
| ---- | -------- | -------------- |
| `id` | `string` | 专辑 publicId  |

#### 响应示例

```json
{
  "publicId": "01960a11-...",
  "title": "Pokémon Diamond & Pearl Super Music Collection",
  "albumArtist": "Go Ichinose / Hitomi Sato",
  "year": 2007,
  "trackCount": 158,
  "discCount": 4,
  "sourceDirectory": "Pokemon/Diamond-Pearl",
  "tracks": [
    {
      "publicId": "01960b2a-...",
      "title": "Opening",
      "artist": "Go Ichinose",
      "durationSeconds": 62,
      "trackNumber": 1,
      "discNumber": 1,
      "discTitle": null,
      "mediaAssetId": "01960b2a-..."
    }
  ]
}
```

#### 错误响应

| 状态码 | 说明         |
| ------ | ------------ |
| `404`  | 专辑不存在   |

---

### GET /api/albums/:id/tracks

仅获取专辑的曲目列表（不含专辑元信息）。

#### 响应示例

```json
[
  {
    "publicId": "01960b2a-...",
    "title": "Opening",
    "artist": "Go Ichinose",
    "durationSeconds": 62,
    "trackNumber": 1,
    "discNumber": 1,
    "discTitle": null,
    "mediaAssetId": "01960b2a-..."
  }
]
```

---

## 系列 Series

### GET /api/series

获取所有系列列表，按标题排序。

#### 响应示例

```json
[
  {
    "publicId": "01960a00-...",
    "name": "Pokémon",
    "sortTitle": "pokemon",
    "albumCount": 32
  }
]
```

---

### GET /api/series/:id

获取系列详情，包含所属专辑列表。

#### 路径参数

| 参数 | 类型     | 说明           |
| ---- | -------- | -------------- |
| `id` | `string` | 系列 publicId  |

#### 响应示例

```json
{
  "publicId": "01960a00-...",
  "name": "Pokémon",
  "sortTitle": "pokemon",
  "albums": [
    {
      "publicId": "01960a11-...",
      "title": "Pokémon Red & Blue",
      "albumArtist": "Junichi Masuda",
      "year": 1996,
      "trackCount": 37,
"discCount": 1
    }
  ]
}
```

#### 错误响应

| 状态码 | 说明         |
| ------ | ------------ |
| `404`  | 系列不存在   |

---

## 合集 Collections

合集是用户手动创建的播放列表。

### GET /api/collections

获取所有合集列表。

#### 响应示例

```json
[
  {
    "publicId": "01960c00-...",
    "title": "我的最爱",
    "description": "精选曲目",
    "status": "published",
    "trackCount": 24
  }
]
```

---

### GET /api/collections/:id

获取合集详情，包含曲目列表及曲目所属专辑信息。

#### 路径参数

| 参数 | 类型     | 说明           |
| ---- | -------- | -------------- |
| `id` | `string` | 合集 publicId  |

#### 响应示例

```json
{
  "publicId": "01960c00-...",
  "title": "我的最爱",
  "description": "精选曲目",
  "status": "published",
  "tracks": [
    {
      "publicId": "01960b2a-...",
      "title": "Battle Tower",
      "artist": "Go Ichinose",
      "durationSeconds": 183,
      "trackNumber": 5,
      "discNumber": 1,
      "mediaAssetId": "01960b2a-...",
      "albumId": "01960a11-...",
      "albumTitle": "Pokémon Diamond & Pearl Super Music Collection"
    }
  ]
}
```

#### 错误响应

| 状态码 | 说明         |
| ------ | ------------ |
| `404`  | 合集不存在   |

---

## 媒体资源

### GET /api/assets/:id/cover

获取媒体资产的封面图片。

- 若封面文件存在于本地缓存目录，直接返回图片流
- 若封面存储于对象存储（COS），返回 `302` 重定向

#### 路径参数

| 参数 | 类型     | 说明               |
| ---- | -------- | ------------------ |
| `id` | `string` | 媒体资产 publicId  |

#### 响应

支持格式：`image/jpeg`、`image/png`、`image/webp`

#### 错误响应

| 状态码 | 说明         |
| ------ | ------------ |
| `404`  | 封面不存在   |

---

## 搜索

### GET /api/search

全局搜索接口，同时搜索专辑和曲目。推荐使用 `/api/tracks/search` 进行更精细的曲目搜索。

#### 查询参数

| 参数 | 类型     | 必填 | 说明         |
| ---- | -------- | ---- | ------------ |
| `q`  | `string` | 否   | 搜索关键词   |

#### 响应示例

```json
{
  "albums": [
    {
      "publicId": "01960a11-...",
      "title": "Pokémon Diamond & Pearl Super Music Collection",
      "albumArtist": "Go Ichinose / Hitomi Sato",
      "year": 2007,
      "trackCount": 0,
      "discCount": 0
    }
  ],
  "tracks": [
    {
      "publicId": "01960b2a-...",
      "title": "Battle Tower",
      "artist": "Go Ichinose",
      "durationSeconds": 183,
      "trackNumber": 5,
      "discNumber": 1,
      "mediaAssetId": "01960b2a-...",
      "albumId": "01960a11-...",
      "albumTitle": "Pokémon Diamond & Pearl Super Music Collection"
    }
  ]
}
```

---

## 类型定义参考

### AlbumSearchItem

| 字段           | 类型      | 说明                          |
| -------------- | --------- | ----------------------------- |
| `publicId`     | `string`  | 唯一 ID                       |
| `title`        | `string`  | 展示标题                      |
| `albumArtist`  | `string`  | 展示艺术家                    |
| `year`         | `number?` | 发行年份                      |
| `trackCount`   | `number`  | 曲目数量                      |
| `discCount`    | `number`  | 碟数                          |
| `seriesId`     | `string?` | 所属系列 ID                   |
| `seriesName`   | `string?` | 所属系列名称                  |
| `coverUrl`     | `string?` | 封面图片 URL（仅搜索接口返回）|

### TrackSearchItem

| 字段              | 类型             | 说明                         |
| ----------------- | ---------------- | ---------------------------- |
| `publicId`        | `string`         | 唯一 ID                      |
| `title`           | `string`         | 展示标题                     |
| `artist`          | `string`         | 展示艺术家                   |
| `durationSeconds` | `number`         | 时长（秒）                   |
| `trackNumber`     | `number`         | 曲目编号                     |
| `discNumber`      | `number`         | 碟号                         |
| `discTitle`       | `string?`        | 分碟标题                     |
| `mediaAssetId`    | `string`         | 媒体资产 ID                  |
| `albumId`         | `string?`        | 所属专辑 ID                  |
| `albumTitle`      | `string?`        | 专辑名称                     |
| `albumArtist`     | `string?`        | 专辑艺术家                   |
| `year`            | `number?`        | 发行年份                     |
| `genre`           | `string?`        | 流派                         |
| `streamUrl`       | `string`         | 音频流 URL（仅搜索接口返回） |
| `coverUrl`        | `string?`        | 封面图片 URL（仅搜索接口返回）|

### CollectionStatus

| 值            | 说明   |
| ------------- | ------ |
| `"draft"`     | 草稿   |
| `"published"` | 已发布 |
