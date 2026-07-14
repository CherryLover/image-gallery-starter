# Jiang jiwei ShutterShowcase

个人摄影作品展示站。基于 Next.js 图库模板改造：图片在 Cloudflare R2，尺寸与主色等元数据写在仓库内 JSON。

## 数据怎么组织

| 内容 | 位置 |
|------|------|
| 原图 / 网页用 JPEG | Cloudflare R2 桶 `s3-hono`，路径 `gallery/` |
| 公开访问 | `https://s3-store.flyooo.uk/gallery/文件名.jpg` |
| 列表元数据 | `data/images.json`（宽高、主色、模糊占位、URL） |

运行站点**不需要**任何 Cloudinary 密钥。

## 本地运行

```bash
npm install
npm run dev
```

## 从 Cloudinary 再迁一次（可选）

脚本在仓库里，和算法、生成 JSON 的逻辑放在一起：

```bash
# 密钥只走环境变量，不要写进代码仓库
export CLOUDINARY_CLOUD_NAME=你的cloud_name
export CLOUDINARY_API_KEY=你的key
export CLOUDINARY_API_SECRET=你的secret

# 默认只迁 skv 文件夹（个人作品），跳过 samples；HEIC 会转成 JPEG
npm run migrate:cloudinary

# 若图片已在本地 .migration/web，只重算主色和 JSON：
npm run generate:images
```

主色算法在 `scripts/generate-images-json.py`：缩略采样后对 RGB 做平方根均值（Unsplash 一类代表色常见做法），写入每条记录的 `color`。

## 只加几张新图

1. 上传到 R2：

```bash
wrangler r2 object put s3-hono/gallery/新文件.jpg --file ./新文件.jpg --content-type image/jpeg --remote
```

2. 把文件放进 `.migration/web`，再生成 JSON：

```bash
npm run generate:images
```

3. 提交 `data/images.json` 并部署。

## 部署

推到 GitHub 后由 Vercel 等平台静态构建即可，无需配置 Cloudinary 环境变量。
