# 从现有 frontend 部署 Cedar & Cursor 官网

所有官网页面、服务详情、博客、FAQ、SEO 和联系表单都在 `frontend/`。在 Vercel 导入仓库时，**Root Directory 选 `frontend`**，框架选 Next.js。请使用适用于商业站点的团队，避免把本机数据库、备份及私密环境文件上传到 Git。

在 Vercel 项目的 Preview 和 Production 环境配置：

| 变量 | 值 |
|---|---|
| `CEDAR_PUBLIC_ONLY` | `1` |
| `SITE_URL` | `https://cedarandcursor.com` |
| `CONTACT_TO` | `jun@cedarandcursor.com` |
| `CONTACT_FROM` | Resend 已验证发件域下的纯邮箱，例如 `website@notify.cedarandcursor.com` |
| `RESEND_API_KEY` | Resend 发信密钥，请设置为敏感值 |

`CEDAR_PUBLIC_ONLY=1` 使用本仓库中 `content/` 的已发布内容快照，并关闭 Studio 登录、工作区和 Django 私有代理。即使未设置该值，Vercel 提供 `VERCEL=1` 时也启用公开模式。Preview 环境限制索引。本机 Docker 或原有 Django 部署保持原配置即可。完整模式仍从 Django 读取已发布的博客和官网字段，并通过 `/api/inquiries` 收询盘。我们只对匹配原公开版本的文章和仍等于基线的官网字段应用这次补充，后来已发布的后台修改优先。纯展示模式不会自动读取本机 Django，新文章可更新 `content/articles.json` 后随 `frontend` 部署。

先部署预览，测试手机导航、博客和表单。发信配置完整后表单使用 `/api/contact`。未配置时访客可直接打开公司邮箱或下载简报。正式上线前，从部署网站提交测试询盘，在 Zoho 的 `jun@cedarandcursor.com` 收件箱核对参考号和 Reply-To。建议对 `POST /api/contact` 按 IP 设置适当的频率限制。

在 Vercel 的 Domains 添加 `cedarandcursor.com`，按 Vercel 返回的记录更新 Cloudflare。保留现有 Zoho MX、SPF、DKIM 以及发件子域记录。HTTPS 生效后再次验证收件，再提交 `https://cedarandcursor.com/sitemap.xml`。 [Vercel 域名配置](https://vercel.com/docs/domains/set-up-custom-domain) · [Resend 发件域验证](https://resend.com/docs/dashboard/domains/introduction)
