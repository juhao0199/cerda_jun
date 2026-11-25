import path from "node:path";
import type { NextConfig } from 'next';
const backend = (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: '/api/inquiries', destination: `${backend}/api/v1/inquiries/` },
      ...['csrf','login','logout','me','password'].map(action => ({source:`/api/v1/auth/${action}`, destination:`${backend}/api/v1/auth/${action}/`})),
      ...['overview','leads','stage','notes','clients','assign','create','edit','archive','export'].map(action => ({source:`/api/v1/staff/crm/${action}`, destination:`${backend}/api/v1/staff/crm/${action}/`})),
      {source:'/api/v1/staff/crm/leads/:reference', destination:`${backend}/api/v1/staff/crm/leads/:reference/`},
      ...['catalog','list','create','change','detail/:reference','pdf/:reference/:version'].map(action => ({source:`/api/v1/staff/quotations/${action}`, destination:`${backend}/api/v1/staff/quotations/${action}/`})),
      ...['list','create','change','detail/:slug','revision/:slug/:version','cover/upload','cover/:imageId','media/list','media/detail/:imageId','media/change','media/derive'].map(action => ({source:`/api/v1/staff/blog/${action}`, destination:`${backend}/api/v1/staff/blog/${action}/`})),
      {source:'/api/v1/public/blog/cover/:imageId',destination:`${backend}/api/v1/public/blog/cover/:imageId/`},
      ...['team','team/action','security-center'].map(action => ({source:`/api/v1/staff/${action}`, destination:`${backend}/api/v1/staff/${action}/`})),
      ...['inquiries','security-events'].map(action => ({source:`/api/v1/staff/${action}`, destination:`${backend}/api/v1/staff/${action}/`})),
    ];
  },
  async headers() {
    return [{source:'/:path*',headers:[
      {key:'X-Content-Type-Options',value:'nosniff'}, {key:'X-Frame-Options',value:'DENY'},
      {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
      {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
    ]}];
  },
};
export default nextConfig;
