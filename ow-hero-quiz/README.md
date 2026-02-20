# OW Hero Quiz

守望先锋英雄匹配问卷（静态网页版）。

特性：
- 12 题评估（全段位）
- 定位 + 英雄池 + 主练/副练建议
- 雷达图可视化
- 一键导出分享海报（PNG 1080x1440，适配小红书）

## 本地预览

```bash
cd ow-hero-quiz
python3 -m http.server 8080
# 打开 http://localhost:8080
```

## 发布到 GitHub Pages

1. 把 `ow-hero-quiz` 放到仓库根目录（当前已在 workspace）。
2. 推送到 GitHub 仓库。
3. 在仓库 Settings -> Pages：
   - Source 选 `Deploy from a branch`
   - Branch 选 `main`
   - Folder 选 `/ow-hero-quiz`（如果平台不支持子目录，建议独立仓库）

### 推荐方式（独立仓库最稳）

- 新建仓库 `ow-hero-quiz`
- 把当前目录文件上传到仓库根
- Pages 选择 `main /root`

## 版本说明

- `PLAN.md`：计划与研究
- `DECISIONS.md`：需求确认结论
- `CHANGELOG.md`：迭代记录
