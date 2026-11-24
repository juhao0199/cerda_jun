'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, mutate, ApiError, type Role } from '@/lib/session-api';
import { handleSessionError } from './shell';
import styles from './workspace.module.css';
import team from './team.module.css';

type Account = { id: string; username: string; role: Role; active: boolean; protected: boolean; version: string; lastLogin: string | null };
type EventRow = { id: string; action: string; actorId: string | null; targetId: string | null; createdAt: string };
type Page<T> = { results: T[]; page: number; hasMore: boolean };
type Action = 'revoke' | 'disable' | 'enable' | 'role';
const actionLabels: Record<Action, string> = { revoke: 'Revoke sessions', disable: 'Disable account', enable: 'Enable account', role: 'Change role' };
const date = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function useDirectory<T>(endpoint: string, filters: Record<string, string>) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Page<T> | null>(null);
  const [error, setError] = useState('');
  const params = new URLSearchParams({ ...filters, page: String(page) }).toString();
  const key = `${endpoint}?${params}`;
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError('');
    api<Page<T>>(key, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult(data);
    }).catch(err => { if (!controller.signal.aborted) setError(handleSessionError(err)); });
    return () => controller.abort();
  }, [key, revision]);
  function refresh() { setResult(null); setRevision(v => v + 1); }
  return { result, error, page, setPage, refresh };
}
function Pagination({ page, more, disabled, onPage }: { page: number; more: boolean; disabled: boolean; onPage: (page: number) => void }) {
  return <div className={team.pagination}><span>Page {page}</span><div><button className={styles.secondaryButton} disabled={disabled || page === 1} onClick={() => onPage(page - 1)}>Previous</button><button className={styles.secondaryButton} disabled={disabled || !more || page >= 1000} onClick={() => onPage(page + 1)}>Next</button></div></div>;
}
function ActionDialog({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [action, setAction] = useState<Action>('revoke');
  const [role, setRole] = useState<'staff' | 'client'>(account.role === 'staff' ? 'client' : 'staff');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current || conflict) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const password = String(fields.get('password') ?? '');
    const code = String(fields.get('code') ?? '');
    // Do not put credentials in component state, browser storage, or logs.
    const passwordField = form.elements.namedItem('password') as HTMLInputElement;
    const codeField = form.elements.namedItem('code') as HTMLInputElement;
    passwordField.value = ''; codeField.value = '';
    busy.current = true; setPending(true); setError('');
    try {
      await mutate<Account>('staff/team/action', { id: account.id, version: account.version, action, password, code, ...(action === 'role' ? { role } : {}) });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setConflict(true);
      setError(handleSessionError(err, 'Unable to update account. Refresh to verify its current state.'));
    } finally { busy.current = false; setPending(false); }
  }
  return <dialog className={team.dialog} ref={ref} aria-labelledby="team-action-title" onCancel={event => { event.preventDefault(); if (!busy.current) onClose(); }}>
    <div className={team.dialogHeader}><div><h2 id="team-action-title">Manage access</h2><p>{account.username} · {account.role}</p></div><button type="button" className={styles.secondaryButton} disabled={pending} onClick={onClose}>Close</button></div>
    <form className={team.form} onSubmit={submit}>
      <label><span id="team-action-label">Action</span><select aria-labelledby="team-action-label" value={action} disabled={pending} onChange={event => setAction(event.target.value as Action)}><option value="revoke">Revoke sessions</option><option value={account.active ? 'disable' : 'enable'}>{account.active ? 'Disable account' : 'Enable account'}</option><option value="role">Change role</option></select></label>
      {action === 'role' && <label><span id="team-new-role-label">New role</span><select aria-labelledby="team-new-role-label" value={role} disabled={pending} onChange={event => setRole(event.target.value as 'staff' | 'client')}><option value="staff">Staff</option><option value="client">Client</option></select></label>}
      <p className={team.notice}>All existing sessions for this account will be invalidated on their next request. Confirm with your own password and a fresh authenticator code.</p>
      <label>Your password<input name="password" type="password" autoComplete="current-password" maxLength={256} required disabled={pending || conflict}/></label>
      <label>Authenticator code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={pending || conflict}/></label>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={team.dialogActions}>{conflict ? <button type="button" className={styles.primaryButton} onClick={onClose}>Close and reload</button> : <button className={styles.primaryButton} disabled={pending}>{pending ? 'Verifying…' : actionLabels[action]}</button>}</div>
    </form>
  </dialog>;
}
export function TeamDirectory() {
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const directory = useDirectory<Account>('staff/team', filters);
  const [selected, setSelected] = useState<Account | null>(null);
  const [notice, setNotice] = useState('');
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    directory.setPage(1); setFilters({ search: String(data.get('search')).trim(), role: String(data.get('role')), status: String(data.get('status')) }); directory.refresh();
  }
  return <><div className={styles.headingRow}><div className={styles.pageHeading}><h1>Team &amp; access</h1><p>Manage application roles and account access.</p></div><button className={styles.secondaryButton} onClick={directory.refresh}>Refresh</button></div>
    <section className={styles.panel}><div className={styles.panelHeading}><h2>Account directory</h2><span className={styles.muted}>Owner access only</span></div>
      <form className={team.filters} onSubmit={search}><label>Search username<input name="search" type="search" maxLength={150} placeholder="Search accounts"/></label><label><span id="team-filter-role-label">Role</span><select aria-labelledby="team-filter-role-label" name="role"><option value="">All roles</option><option value="owner">Owner</option><option value="staff">Staff</option><option value="client">Client</option></select></label><label><span id="team-filter-status-label">Status</span><select aria-labelledby="team-filter-status-label" name="status"><option value="">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option></select></label><button className={styles.secondaryButton}>Apply filters</button></form>
      {notice && <p role="status" className={team.notice}>{notice}</p>}{directory.error && <p role="alert" className={styles.error}>{directory.error}</p>}
      {!directory.result ? <p role="status" className={styles.muted}>{directory.error ? 'Data unavailable.' : 'Loading accounts…'}</p> : directory.result.results.length === 0 ? <div className={styles.empty}>No matching accounts.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Access</th></tr></thead><tbody>{directory.result.results.map(account => <tr key={account.id}><td><strong>{account.username}</strong><small>ID {account.id}</small></td><td className={team.capitalize}>{account.role}</td><td><span className={account.active ? team.active : team.inactive}>{account.active ? 'Active' : 'Disabled'}</span></td><td>{date(account.lastLogin)}</td><td>{account.protected ? <span className={styles.muted}>Protected</span> : <button className={styles.secondaryButton} aria-label={`Manage ${account.username}`} onClick={() => { setNotice(''); setSelected(account); }}>Manage</button>}</td></tr>)}</tbody></table></div>}
      <Pagination page={directory.page} more={!!directory.result?.hasMore} disabled={!directory.result} onPage={directory.setPage}/>
    </section><section className={`${styles.panel} ${team.policy}`}><h2>Account provisioning</h2><p>New accounts and MFA enrollment are managed through the trusted operator console. Owner accounts cannot be changed from this workspace.</p></section>
    {selected && <ActionDialog key={selected.id} account={selected} onClose={() => { setSelected(null); directory.refresh(); }} onDone={() => { setSelected(null); setNotice('Account updated. Previous sessions are revoked.'); directory.refresh(); }}/>}</>;
}
export function SecurityCenter() {
  const [filters, setFilters] = useState({ category: '', account: '' });
  const directory = useDirectory<EventRow>('staff/security-center', filters);
  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); directory.setPage(1); setFilters({ category: String(data.get('category')), account: String(data.get('account')).trim() }); directory.refresh(); }
  return <><div className={styles.headingRow}><div className={styles.pageHeading}><h1>Security activity</h1><p>Review authentication, access changes and business audit events.</p></div><button className={styles.secondaryButton} onClick={directory.refresh}>Refresh</button></div><section className={styles.panel}>
    <div className={styles.panelHeading}><h2>Audit log</h2><span className={styles.muted}>Read only · local time</span></div>
    <form className={team.filters} onSubmit={search}><label><span id="security-event-category-label">Event category</span><select aria-labelledby="security-event-category-label" name="category"><option value="">All events</option><option value="login">Sign-in</option><option value="logout">Sign-out</option><option value="password">Password</option><option value="account">Account operations</option><option value="team">Team access</option><option value="crm">CRM</option></select></label><label>Actor or target account ID<input name="account" inputMode="numeric" pattern="[1-9][0-9]{0,18}" maxLength={19} placeholder="Account ID"/></label><button className={styles.secondaryButton}>Apply filters</button></form>
    {directory.error && <p className={styles.error} role="alert">{directory.error}</p>}{!directory.result ? <p role="status" className={styles.muted}>{directory.error ? 'Data unavailable.' : 'Loading events…'}</p> : directory.result.results.length === 0 ? <div className={styles.empty}>No matching events.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Event</th><th>Actor ID</th><th>Target ID</th><th>Time</th></tr></thead><tbody>{directory.result.results.map(event => <tr key={event.id}><td><strong>{event.action}</strong></td><td>{event.actorId ?? '—'}</td><td>{event.targetId ?? '—'}</td><td><time dateTime={event.createdAt} title={event.createdAt}>{date(event.createdAt)}</time></td></tr>)}</tbody></table></div>}
    <Pagination page={directory.page} more={!!directory.result?.hasMore} disabled={!directory.result} onPage={directory.setPage}/></section></>;
}
