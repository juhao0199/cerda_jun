export type Role = 'owner' | 'staff' | 'client';
export type Identity = {username:string; role:Role};
export class ApiError extends Error {
  constructor(public status:number, message:string) {super(message); this.name='ApiError';}
}
export async function api<T>(path:string, init:RequestInit={}):Promise<T> {
  const response=await fetch(`/api/v1/${path}`, {...init, credentials:'same-origin', cache:'no-store',
    headers:{Accept:'application/json', ...init.headers}});
  const body=await response.json().catch(()=>null);
  if (!response.ok) throw new ApiError(response.status, typeof body?.error==='string'?body.error:'Service unavailable. Please try again.');
  return body as T;
}
export async function mutate<T>(path:string, data:Record<string,string>={}):Promise<T> {
  const {csrfToken}=await api<{csrfToken:string}>('auth/csrf');
  return api<T>(path,{method:'POST', headers:{'Content-Type':'application/json','X-CSRFToken':csrfToken},body:JSON.stringify(data)});
}
