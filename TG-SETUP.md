# Telegram 图床设置指南

## 步骤 1：创建 Bot（1 分钟）

1. 打开 Telegram，搜索 **@BotFather**
2. 发送命令：`/newbot`
3. 输入 Bot 名称（如 `CL游戏姬图床`）
4. 输入 Bot 用户名（必须以 `bot` 结尾，如 `clyx_img_bot`）
5. 得到 Token：`1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`
6. **保存这个 Token，不要泄露**

## 步骤 2：创建私密频道（30 秒）

1. Telegram 主页 → 左上角菜单 → 新建频道
2. 频道名：`CL-Images`（或任意）
3. 频道类型：选择 **私有**
4. 创建

## 步骤 3：将 Bot 添加为频道管理员

1. 进入刚创建的频道
2. 点频道名 → 管理员 → 添加管理员
3. 搜索你的 Bot 用户名（如 `@clyx_img_bot`）
4. 添加 → 完成

## 步骤 4：获取频道 ID

1. 在频道里随便发一条消息（文字即可）
2. 在浏览器访问（替换 TOKEN）：
   ```
   https://api.telegram.org/bot<你的TOKEN>/getUpdates
   ```
3. 在返回的 JSON 中找到 `"chat":{"id":-100xxxxxxxxxx}`
4. 复制这个负数 ID（如 `-1001234567890`）

## 步骤 5：部署 Cloudflare Function

1. `git push` 到仓库后 Cloudflare Pages 自动部署
2. Function 文件路径：`functions/upload-img.js`
3. 无需额外配置，Bot Token 和频道 ID 在前端填写

## 步骤 6：使用

1. 打开管理后台 → 点击「上传图片」
2. 首次使用填写 Bot Token 和频道 ID（自动保存在浏览器本地）
3. 选择图片 → 点击上传
4. 复制返回的直链 URL，粘贴到文章内容中

## 工作原理

```
浏览器 → POST /upload-img → Cloudflare Function
                               → Telegram Bot API (sendPhoto)
                               → 获取 file_id
                               → getFile 获取文件路径
                               → 返回直链: https://api.telegram.org/file/bot<TOKEN>/<路径>
```

- 图片存储在 Telegram 服务器上
- 通过 Telegram CDN 全球加速
- 无限容量，不限制流量
- Bot Token 只存在你的浏览器 localStorage 中
