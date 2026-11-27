# Cedar & Cursor 官网 · Vercel 发布包

这是一份独立的 Next.js 官网项目。保留 Studio OS 的原有展示设计、首屏交互、案例、估价器，以及从公开接口取得的 3 篇完整文章和已发布图片。新增 4 个服务详情、9 个常见问答、7 个项目准备问答，以及各篇文章的简答、补充指南和相关推荐。

这个项目只包含公开内容和联系表单。现有 Studio OS、客户记录和报价系统继续使用原部署。这里的博客是已发布内容的快照。今后更新 `content/articles.json` 和 `content/editorial.json` 后重新部署即可，后台编辑不会自动同步到 Vercel。

## 1. 在 Vercel 导入

本项目位于 Cedar & Cursor 源码库的 `vercel-showcase/` 目录。若从已有仓库导入 Vercel，Root Directory 选 `vercel-showcase`，框架选 Next.js，并且只部署该目录。项目也可以仅从 `vercel-showcase/` 作为独立目录通过已登录的 Vercel CLI 部署。不要把本机的环境文件、数据库或备份上传到 Git。保留标准安装和构建设置，使用 Node 22 或更新的受支持版本。官网属于商业项目，请选可用于商业网站的 Pro 或 Enterprise 团队。[Vercel CLI 官方流程](https://vercel.com/docs/projects/deploy-from-cli) · [商业使用规则](https://vercel.com/docs/limits/fair-use-guidelines)

建议先在预览地址看首页、服务详情、三篇博客、联系表单及手机布局，再切换正式域名。预览构建自动加 `noindex`，正式页面使用 `https://cedarandcursor.com` 作为 canonical。

## 2. 接通询盘邮件

Vercel 项目连接 Resend，或在已有的 Resend 项目内创建仅发信的 API key。添加并验证一个专门的发件子域，例如 `notify.cedarandcursor.com`。在 Cloudflare DNS 中添加 Resend 为该子域给出的记录。保留主域现有 Zoho MX、SPF、DKIM 和其他邮件记录。Resend 验证发件子域不会替换收件服务。 [Vercel 的 Resend 集成](https://vercel.com/marketplace/resend) · [Resend 域名验证](https://resend.com/docs/dashboard/domains/introduction)

在 Vercel → Project → Settings → Environment Variables 配置这些服务端值。API Key 设为敏感值，不要放进代码或聊天。

| 变量 | 值 |
|---|---|
| `SITE_URL` | `https://cedarandcursor.com` |
| `CONTACT_TO` | `jun@cedarandcursor.com` |
| `CONTACT_FROM` | 已验证发件域下的纯邮箱，例如 `website@notify.cedarandcursor.com`，不加显示名 |
| `RESEND_API_KEY` | 有权使用发件域的 Resend 发送密钥 |

配置后重新部署，确保变量覆盖实际测试环境（Preview 或 Production）。官网一直显示 `jun@cedarandcursor.com`。只有发件配置齐备才显示提交功能，未配置时提供直接发邮件和本地导出简报。服务端将消息发送到固定收件箱，将访客邮箱设为 Reply-To，并使原样重试复用同一请求标识。页面的成功状态表示邮件服务接受提交，最后仍以收件箱收到为准。

在正式流量进入前，建议在 Vercel Firewall 对 `POST /api/inquiries` 按来源 IP 加频率限制，例如每分钟 5 次。 [Vercel Firewall 速率限制](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)

**收件验收**：从部署后的页面发一条标注 `Cedar 官网测试` 的表单，填你可以检查的回复邮箱。记录成功提示里的参考号。确认 `jun@cedarandcursor.com` 收件箱或垃圾邮件中收到相同参考号，点击回复检查收件人是测试填写的邮箱。若没收到，到 Resend 查看对应投递记录；HTTP 成功和 `accepted` 不是收件证明。 [Resend 发信接口](https://resend.com/docs/api-reference/emails/send-email)

## 3. 绑定已买的域名

在 Vercel 项目的 Domains 添加 `cedarandcursor.com`。如果希望 `www` 也可访问，可加上 `www.cedarandcursor.com` 并重定向到主域。Cloudflare 当前负责该域名 DNS。将 Vercel 给出的确切 A、CNAME 或验证记录复制到 Cloudflare，首次接入建议使用 DNS only。尽量只修改网站所需的记录，保留 Zoho 和已验证的发件子域。看到 Vercel 域名配置为有效且 HTTPS 证书已签发，再通过正式域名复验首页、表单收件和 `/sitemap.xml`。 [Vercel 自定义域名设置](https://vercel.com/docs/domains/set-up-custom-domain)

正式域名可访问后，用 Google Search Console 验证域名并提交 `https://cedarandcursor.com/sitemap.xml`。网站的标题、描述、canonical、社交分享图、RSS、结构化信息和正文已按公开内容设置。搜索排名、被 AI 引用和收录时间由平台决定。 [Google 关于 AI 搜索的说明](https://developers.google.com/search/docs/appearance/ai-features)

## 本地验证

在 `cedar-cursor-v1.7` 项目根目录运行：

```sh
cd vercel-showcase
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

表单发送和重试 UI 专项用例需要配置测试构建并切换 `CEDAR_TEST_CONTACT_MODE=enabled`。该浏览器用例会拦截发送请求，正常测试不向外部邮箱投递。详见 `VERIFICATION.md`。不要把演示用的发件值带到生产。
