import {test,expect} from '@playwright/test';
test('login UI has password and OTP fields, no signup, and nonce CSP',async({page})=>{
 const response=await page.goto('/login');
 const csp=response?.headers()['content-security-policy']??'';
 expect(csp).toContain("'nonce-");
 expect(csp).toContain("frame-ancestors 'none'");
 expect(csp).not.toContain("'unsafe-eval'");
 await expect(page.getByLabel('Username')).toBeVisible();
 await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','password');
 await expect(page.getByLabel('Authenticator code')).toBeVisible();
 await expect(page.getByRole('link',{name:/sign up/i})).toHaveCount(0);
});
test('workspace does not display privileged records if API returns unauthorized',async({page})=>{
 await page.route('**/api/v1/auth/me',route=>route.fulfill({status:401,contentType:'application/json',body:'{"error":"Authentication required."}'}));
 await page.goto('/workspace');
 await expect(page).toHaveURL(/\/login$/);
 await expect(page.getByRole('heading',{name:'Recent inquiries'})).toHaveCount(0);
});
