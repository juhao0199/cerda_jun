'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, mutate, ApiError, type Identity } from '@/lib/session-api';
import { navigation, type Section } from './navigation';
import styles from './workspace.module.css';

const IdentityContext = createContext<Identity | null>(null);
export function useIdentity(): Identity {
  const identity = useContext(IdentityContext);
  if (!identity) throw new Error('Workspace identity is unavailable.');
  return identity;
}
export function handleSessionError(error: unknown, fallback = 'Unable to load data. Please retry.'): string {
  if (error instanceof ApiError && error.status === 401) {
    window.location.replace('/login');
    return 'Session expired.';
  }
  return error instanceof Error ? error.message : fallback;
}
export function WorkspaceIcon({ name }: { name: Section | 'menu' | 'logout' | 'arrow' | 'collapse' }) {
  const paths: Record<typeof name, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    leads: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-13 4h8m-8 3h5"/></>,
    clients: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v2"/></>,
    quotations: <><path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8m-8 4h8"/></>,
    blog: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    media: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m3 17 6-5 4 4 3-3 5 4"/></>,
    editorial: <><path d="M3 4h7l2 3h9v13H3z"/><path d="M7 12h10m-10 4h7"/></>,
    seo: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    aeo: <><path d="M4 4h16v12H9l-5 4z"/><path d="M8 8h8m-8 4h5"/></>,
    geo: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></>,
    audit: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m7 11 3 3 6-6M7 17h10"/></>,
    crawlers: <><rect x="5" y="7" width="14" height="12" rx="3"/><path d="M12 3v4M2 11h3m14 0h3M9 11h.01M15 11h.01M9 15h6"/></>,
    team: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m4-11v6m-3-3h6"/></>,
    security: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/><circle cx="12" cy="12" r="7"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>, logout: <><path d="M10 4H4v16h6m4-12 4 4-4 4m-5-4h11"/></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>, collapse: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m8-11-3 3 3 3"/></>,
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function allowWorkspaceLeave(){return window.dispatchEvent(new Event('cedar:workspace-leave',{cancelable:true}));}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<{ path: string; identity: Identity } | null>(null);
  const [problem, setProblem] = useState<{ path: string; message: string } | null>(null);
  const [actionError, setActionError] = useState('');
  const [revision, setRevision] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const identity = session?.identity ?? null;
  const verified = session?.path === pathname;
  const error = problem?.path === pathname ? problem.message : '';
  useEffect(() => {
    const controller = new AbortController();
    api<Identity>('auth/me', { signal: controller.signal }).then(me => {
      if (!controller.signal.aborted) { setSession({ path: pathname, identity: me }); setProblem(null); }
    }).catch(e => { if (!controller.signal.aborted) { setSession(null); setProblem({ path: pathname, message: handleSessionError(e) }); } });
    return () => controller.abort();
  }, [pathname, revision]);
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, []);
  async function signOut() {
    if (busy.current || !allowWorkspaceLeave()) return;
    busy.current = true; setPending(true); setActionError('');
    try { await mutate('auth/logout'); setSession(null); window.location.replace('/login'); }
    catch (e) { setActionError(handleSessionError(e, 'Unable to sign out. Please retry.')); }
    finally { busy.current = false; setPending(false); }
  }
  if (!identity) return <div className={styles.gate}><div role={error ? 'alert' : 'status'}>{error || 'Checking your session…'}</div>{error && <button onClick={() => { setProblem(null); setRevision(n => n + 1); }}>Retry</button>}</div>;
  const items = navigation.filter(item => item.roles.includes(identity.role));
  const current = items.find(item => item.href === pathname);
  return <IdentityContext.Provider value={identity}>
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ''} ${open ? styles.mobileOpen : ''}`}>
      <a className="skip" href="#workspace-main">Skip to content</a>
      <aside className={styles.sidebar} id="workspace-sidebar" aria-label="Workspace sidebar">
        <div className={styles.brand}><img src="/logo.svg" alt="" width={30} height={30}/><div className={styles.navText}><strong>Cedar &amp; Cursor</strong><small>Studio workspace</small></div></div>
        <nav aria-label="Workspace navigation" className={styles.navigation}>
          {[...new Set(items.map(item => item.group))].map(group => <div className={styles.group} key={group}><p className={styles.groupLabel}>{group}</p>{items.filter(item => item.group === group).map(item => <Link key={item.id} href={item.href} prefetch={false} aria-current={pathname === item.href ? 'page' : undefined} title={item.label} aria-label={item.label} onClick={e => { if (item.href!==pathname&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.button===0&&!allowWorkspaceLeave()){e.preventDefault();return;}setOpen(false); }}><WorkspaceIcon name={item.id}/><span className={styles.navText}>{item.label}</span></Link>)}</div>)}
        </nav>
        <div className={styles.account}><div className={styles.avatar}>{identity.username.slice(0,1).toUpperCase()}</div><div className={styles.navText}><strong>{identity.username}</strong><small>{identity.role}</small></div><button type="button" className={styles.iconButton} aria-label="Sign out" title="Sign out" disabled={pending} onClick={signOut}><WorkspaceIcon name="logout"/></button></div>
      </aside>
      <div className={styles.content}>
        <div className={styles.topbar}>
          <button className={`${styles.iconButton} ${styles.desktopToggle}`} type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="workspace-sidebar" onClick={() => setCollapsed(v => !v)}><WorkspaceIcon name="collapse"/></button>
          <button className={`${styles.iconButton} ${styles.mobileToggle}`} type="button" aria-label="Toggle workspace navigation" aria-expanded={open} aria-controls="workspace-sidebar" onClick={() => setOpen(v => !v)}><WorkspaceIcon name="menu"/></button>
          <div className={styles.breadcrumb}>Workspace <span>/</span> <strong>{current?.label || 'Page'}</strong></div>
          <Link href="/" className={styles.siteLink} onClick={e=>{if(!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.button===0&&!allowWorkspaceLeave())e.preventDefault();}}>View website ↗</Link>
        </div>
        <main id="workspace-main" className={styles.main}>
          {actionError && <p className={styles.error} role="alert">{actionError}</p>}
          {verified ? children : <p role="status" className={styles.muted}>Checking your session…</p>}
        </main>
      </div>
    </div>
  </IdentityContext.Provider>;
}
