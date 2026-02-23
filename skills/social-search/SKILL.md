---
name: social-search
description: 搜索小红书和微博内容。使用此 skill 当用户要求搜索、查询小红书(Xiaohongshu/RedNote)或微博(Weibo)时。
---

# 社交媒体搜索 (小红书 + 微博)

此 skill 整合了两个 MCP 服务：RedNote-MCP (小红书) 和 mcp-server-weibo (微博)。

## 安装

### 1. 安装 RedNote MCP (小红书)

```bash
# 安装依赖
npm install -g rednote-mcp
npx playwright install

# 初始化登录 (必须)
rednote-mcp init
```

登录后会自动保存 Cookie 到 `~/.mcp/rednote/cookies.json`

### 2. 安装 Weibo MCP (微博)

```bash
# 使用 uvx (推荐)
uvx mcp-server-weibo

# 或使用 pip
pip install mcp-server-weibo
```

## 配置 MCP

在 `~/.openclaw/config.json` 中添加：

```json
{
  "mcpServers": {
    "rednote": {
      "command": "rednote-mcp",
      "args": ["--stdio"]
    },
    "weibo": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/qinyuanpei/mcp-server-weibo.git", "mcp-server-weibo"]
    }
  }
}
```

或使用 npx 方式运行 rednote：

```json
{
  "mcpServers": {
    "rednote": {
      "command": "npx",
      "args": ["rednote-mcp", "--stdio"]
    }
  }
}
```

重启 Gateway 后生效。

## 使用方法

### 小红书 (RedNote MCP)

通过 mcporter 调用：

```bash
# 搜索笔记
mcporter call rednote.search_notes keyword="关键词" limit=10

# 通过 URL 获取笔记内容
mcporter call rednote.get_note_by_url url="https://www.xiaohongshu.com/explore/xxx"

# 获取评论
mcporter call rednote.get_comments_by_url url="https://www.xiaohongshu.com/explore/xxx"
```

### 微博 (Weibo MCP)

```bash
# 搜索用户
mcporter call weibo.search_users keyword="关键词" limit=10

# 获取热搜
mcporter call weibo.get_trendings limit=10

# 搜索内容
mcporter call weibo.search_content keyword="关键词" limit=10 page=1

# 获取用户动态
mcporter call weibo.get_feeds uid="用户ID" limit=10
```

## 注意事项

- 小红书需要登录初始化 (`rednote-mcp init`)，微博不需要
- Cookie 文件包含敏感信息，避免泄露
- 定期更新小红书 Cookie 避免失效
