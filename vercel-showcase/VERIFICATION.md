# 上线前验证

验证日期为 2026-11-27（Asia/Bangkok）。构建使用锁定依赖、Next.js 16.4.6 和 Node 26，应用的最低 Node 版本为 22.13。浏览器使用 Playwright 1.65.1 Chromium，包含桌面和 iPhone 13 尺寸模拟。

| 检查 | 实际结果 |
|---|---|
| 从现有公开接口读取内容 | 3 篇已发布文章和 1 张已发布上传图片。原正文、链接及历史时间字段保留，补充内容单独存放。 |
| `npm run check` | 5 项询盘接口测试、TypeScript 和 Next.js 生产构建通过。 |
| 展示和上线检查 | 桌面、手机共 34 项浏览器用例通过。覆盖首屏、四个交互案例、估价与本地简报、发布图片、服务和博客、FAQ、RSS、站点地图及 SEO 元数据。 |
| 表单浏览器测试 | 桌面和手机各 1 项通过。模拟服务拒绝、保留正文、原样重试及成功参考号。没有对外发信。 |
| 链接及页面资源 | 10 个页面、33 个不同的内部链接和锚点、11 张服务端渲染图片在本地逐一检查。Sunlit 外部案例地址随重定向返回 HTTP 200。 |
| 公开边界 | 可索引页使用正式域名的 canonical。隐私页设置 noindex。`/workspace` 返回 404。发布包不含 Studio OS 管理后台或数据库。 |

默认模式运行 `npm run test:e2e -- e2e/site.spec.ts e2e/launch.spec.ts`。表单 UI 专项需在独立本机构建临时设置 `CONTACT_TO=recipient@example.invalid`、`CONTACT_FROM=sender@example.invalid`、`RESEND_API_KEY=TEST_ONLY_NO_PROVIDER_CREDENTIAL`，启动该构建，再设置 `CEDAR_TEST_CONTACT_MODE=enabled PLAYWRIGHT_EXTERNAL_SERVER=1` 运行 `npm run test:e2e -- e2e/contact-live.spec.ts`。此用例拦截发信请求，不能作为邮件收件证明。

本次交付由你自行发布。未改动 Cloudflare 记录、未部署到 Vercel、未用 Resend 正式密钥发信。正式上线验收以 README 的真实收件、域名 HTTPS 和正式站点访问检查为准。
