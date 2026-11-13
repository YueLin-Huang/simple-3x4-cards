# 3:4简约图文排版

将文案、资料和配图排成 3:4 竖版卡片的 Codex Skill，提供 HTML 预览、1080×1440 JPG 和 ZIP 下载包。

## 默认风格

- 纯白画布、黑灰文字、粉色强调与灰白引用块
- 不添加装饰页眉、页脚、页码或页脚分隔线
- 步骤直接编号，配图紧跟正文，图片保持原比例
- 卡片截图移除多余外底，避免叠出两层灰色
- 网页支持手机预览、阅读模式、页面导航及离线图片下载

![样式预览](examples/preview.jpg)

## 安装到 Codex

将本仓库复制到 `~/.codex/skills/simple-3x4-cards/`，确保该目录直接包含 `SKILL.md`。下一轮对话即可识别。

```sh
git clone https://github.com/YueLin-Huang/simple-3x4-cards.git ~/.codex/skills/simple-3x4-cards
```

显示名称为 **3:4简约图文排版**，技能标识为 `simple-3x4-cards`。

## 使用

```text
用 $simple-3x4-cards 制作三页卡片，每页文案如下……
```

可以直接提供每页文案及配图，也可以提供主题和资料。技能不会自动发布到社交账号。

## 导出

需要 Node.js、Playwright、Chrome/Chromium 和 `zip`。先复制 `assets/starter.html` 到作品目录并替换示例内容，再运行：

```sh
node scripts/render-cards.cjs --help
node scripts/render-cards.cjs --html outputs/example/index.html --out outputs/example --embed
```

可设置 `PLAYWRIGHT_MODULE` 指向已有 Playwright 模块，`CHROME_PATH` 指向浏览器可执行文件。脚本检查五档屏宽、阅读模式、导航和下载，导出 JPG，生成 ZIP，刷新 HTML 内嵌下载并核对字节。导出后还应逐页检查实际图片。

## 文件

- `SKILL.md`：使用说明与排版规范
- `agents/openai.yaml`：Codex 显示名称
- `assets/starter.html`：自包含模板
- `scripts/render-cards.cjs`：图片导出及检查脚本

## 来源

本技能基于通过小红书 RedSkill 商店获取的 `xiaohongshu-cards` 1.0.0 定制，修改了默认配色、页眉页脚、步骤与配图规则，并新增独立名称。保留此来源说明；本仓库不代表原商店官方项目。仓库不包含个人聊天截图、账号配置或安装凭据。
