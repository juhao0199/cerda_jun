'use client';
import {useState, type FormEvent} from 'react';
import {mutate, type Identity} from '@/lib/session-api';
import '../secure.css';
export default function LoginPage(){
  
  const [error,setError]=useState(''); const [pending,setPending]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); if(pending)return;
    const form=event.currentTarget; const data=new FormData(form); setPending(true);setError('');
    try {await mutate<Identity>('auth/login',{username:String(data.get('username')),password:String(data.get('password')),code:String(data.get('code'))});form.reset();window.location.replace('/workspace');}
    catch(e){setError(e instanceof Error?e.message:'Unable to sign in.');}
    finally {setPending(false);}
  }
  return <main id="main" className="secure-shell"><section className="secure-card"><span className="secure-label">Private workspace</span><h1>Sign in.</h1><p>Use your studio account and authenticator to continue.</p><form onSubmit={submit}>
    <label htmlFor="username">Username</label><input id="username" name="username" autoComplete="username" required maxLength={150}/>
    <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256}/>
    <label htmlFor="code">Authenticator code</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/>
    <div role="alert" aria-live="polite">{error}</div><button type="submit" disabled={pending}>{pending?'Signing in…':'Continue →'}</button>
  </form><small>Need access or account recovery? Contact your studio administrator through your established support channel.</small></section></main>;
}
