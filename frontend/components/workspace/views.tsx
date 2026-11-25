'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, mutate, type Identity } from '@/lib/session-api';
import BlogWorkspace from '@/components/blog';
import {EditorialDirectory} from '@/components/blog/editorial';
import {OptimizationCenter} from '@/components/blog/optimization-center';
import {TechnicalCenter} from '@/components/blog/technical-center';
import {MediaLibrary} from '@/components/blog/media-library';
import QuotationWorkspace from '@/components/quotations';
import CRMWorkspace from '@/components/crm/workspace';
import SalesPipeline from '@/components/crm/pipeline';
import { TeamDirectory, SecurityCenter } from './team';
import { canView, type Section } from './navigation';
import { handleSessionError, useIdentity, WorkspaceIcon } from './shell';
import styles from './workspace.module.css';

type Stage = 'new' | 'qualified' | 'proposal' | 'won' | 'lost';
type Summary = { stages: Record<Stage, number>; total: number; clients: number };
type Lead = { reference: string; name: string; company: string; email: string; stage: Stage; createdAt: string };
const stageLabels: Record<Stage, string> = { new:'New', qualified:'Qualified', proposal:'Proposal', won:'Won', lost:'Lost' };
const stageKeys = Object.keys(stageLabels) as Stage[];
const localDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
function Heading({ title, description }: { title: string; description: string }) {
  return <div className={styles.pageHeading}><h1>{title}</h1><p>{description}</p></div>;
}
function Overview({ identity }: { identity: Identity }) {
  const [data, setData] = useState<{ summary: Summary; leads: Lead[] } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (identity.role === 'client') return;
    const controller = new AbortController();
    Promise.all([api<Summary>('staff/crm/overview', { signal: controller.signal }), api<{ results: Lead[] }>('staff/crm/leads?page=1', { signal: controller.signal })]).then(([summary, leads]) => {
      if (!controller.signal.aborted) setData({ summary, leads: leads.results.slice(0,5) });
    }).catch(e => { if (!controller.signal.aborted) setError(handleSessionError(e)); });
    return () => controller.abort();
  }, [identity.role, revision]);
  if (identity.role === 'client') return <><Heading title="Your account" description="Manage your access to the studio workspace."/><div className={styles.panel}><p>Project access is not available in this release.</p><Link href="/workspace/settings">Account settings →</Link></div></>;
  const summary = data?.summary;
  const metrics = [{ label:'Total leads', value:summary?.total }, { label:'Open pipeline', value:summary ? summary.stages.new + summary.stages.qualified + summary.stages.proposal : undefined }, { label:'Won', value:summary?.stages.won }, { label:'Clients', value:summary?.clients }];
  return <><div className={styles.headingRow}><Heading title="Overview" description={identity.role==='owner'?"Track all sales opportunities and client relationships.":"Track your assigned sales opportunities and linked customers."}/><button className={styles.secondaryButton} onClick={() => { setError(''); setData(null); setRevision(n => n+1); }}>Refresh</button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.metrics}>{metrics.map(m => <div className={styles.metric} key={m.label}><span>{m.label}</span><strong>{m.value ?? '—'}</strong></div>)}</div>
    <div className={styles.overviewGrid}>
      <section className={styles.panel} aria-labelledby="pipeline-heading"><div className={styles.panelHeading}><h2 id="pipeline-heading">Sales pipeline</h2><Link href="/workspace/leads" prefetch={false}>View leads <WorkspaceIcon name="arrow"/></Link></div>
      <div className={styles.pipeline}>{stageKeys.map(stage => { const count=summary?.stages[stage]; const width=summary?.total ? (count ?? 0)/summary.total*100 : 0; return <div key={stage} className={styles.pipelineRow}><span>{stageLabels[stage]}</span><div className={styles.track} aria-hidden="true"><div style={{width:`${width}%`}}/></div><strong>{count ?? '—'}</strong></div>; })}</div>
      <p className={styles.muted}>Current distribution of inquiries by sales stage.</p></section>
      <section className={styles.panel} aria-labelledby="quick-heading"><div className={styles.panelHeading}><h2 id="quick-heading">Quick access</h2></div>{[{href:'/workspace/leads', title:'Review leads', text:'Open incoming project inquiries.'},{href:'/workspace/clients',title:'Client directory',text:'View converted customer records.'},{href:'/workspace/settings',title:'Account settings',text:'Manage your password and access.'}].map(item => <Link className={styles.quickLink} key={item.href} href={item.href} prefetch={false}><span><strong>{item.title}</strong><small>{item.text}</small></span><WorkspaceIcon name="arrow"/></Link>)}</section>
    </div>
    <section className={styles.panel} aria-labelledby="recent-heading"><div className={styles.panelHeading}><h2 id="recent-heading">Recent inquiries</h2><Link href="/workspace/leads" prefetch={false}>View all <WorkspaceIcon name="arrow"/></Link></div>
      {!data ? <p className={styles.muted} role="status">{error ? 'Data unavailable.' : 'Loading inquiries…'}</p> : data.leads.length === 0 ? <div className={styles.empty}><WorkspaceIcon name="leads"/><strong>No inquiries yet</strong><p>{identity.role==='owner'?"New website inquiries will appear here.":"Inquiries assigned to you will appear here."}</p></div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Name / company</th><th>Stage</th><th>Received</th></tr></thead><tbody>{data.leads.map(lead => <tr key={lead.reference}><td><strong>{lead.name || lead.company || 'Unnamed lead'}</strong><small>{lead.email}</small></td><td><span className={styles.status}>{stageLabels[lead.stage]}</span></td><td>{localDate(lead.createdAt)}</td></tr>)}</tbody></table></div>}
    </section></>;
}
function AccountSettings({identity}:{identity:Identity}) {
  const [error,setError] = useState(''); const [pending,setPending] = useState(false); const busy=useRef(false);
  async function change(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); if(busy.current)return; const form=event.currentTarget; const data=new FormData(form); busy.current=true;setPending(true);setError('');
    try{await mutate('auth/password',{currentPassword:String(data.get('currentPassword')),newPassword:String(data.get('newPassword')),code:String(data.get('code'))});form.reset();window.location.replace('/login');}
    catch(e){setError(handleSessionError(e,'Unable to change password.'));}finally{busy.current=false;setPending(false);}
  }
  return <><Heading title="Account settings" description="Manage your personal access and security."/><div className={styles.settingsGrid}><section className={styles.panel}><h2>Profile</h2><dl className={styles.profile}><dt>Username</dt><dd>{identity.username}</dd><dt>Role</dt><dd>{identity.role}</dd></dl></section><section className={styles.panel}><h2>Change password</h2><p className={styles.muted}>Changing your password signs out every session. Use a fresh authenticator code.</p><form className={styles.passwordForm} onSubmit={change}><label htmlFor="current">Current password</label><input id="current" name="currentPassword" type="password" autoComplete="current-password" maxLength={256} required/><label htmlFor="new">New password</label><input id="new" name="newPassword" type="password" autoComplete="new-password" minLength={15} maxLength={256} required/><label htmlFor="otp">Authenticator code</label><input id="otp" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/>{error&&<p role="alert" className={styles.error}>{error}</p>}<button className={styles.primaryButton} disabled={pending}>{pending?'Updating…':'Update password'}</button></form></section></div></>;
}
export function WorkspaceView({ section }: { section: Section }) {
  const identity=useIdentity();
  if(!canView(identity.role,section))return <><Heading title="Access denied" description="Your account does not have permission to open this page."/><Link href="/workspace" prefetch={false}>Return to overview →</Link></>;
  switch(section){
    case 'overview':return <Overview identity={identity}/>;
    case 'leads':return <><Heading title="Leads" description={identity.role==='owner'?"Review all inquiries, assign staff and manage opportunities.":"Review your assigned inquiries and record follow-ups."}/><SalesPipeline canManage={identity.role==='owner'}/></>;
    case 'clients':return <><Heading title="Clients" description={identity.role==='owner'?"Manage your directory of converted customers.":"Customers linked to your assigned leads."}/><CRMWorkspace key="clients" mode="clients"/></>;
    case 'quotations':return <QuotationWorkspace/>;
    case 'blog':return <BlogWorkspace canPublish={identity.role==='owner'}/>;
    case 'media':return <MediaLibrary owner={identity.role==='owner'}/>;
    case 'editorial':return <EditorialDirectory owner={identity.role==='owner'}/>;
    case 'seo':return <OptimizationCenter key="seo" mode="seo"/>;
    case 'aeo':return <OptimizationCenter key="aeo" mode="aeo"/>;
    case 'geo':return <OptimizationCenter key="geo" mode="geo"/>;
    case 'audit':return <TechnicalCenter key="audit" owner={identity.role==='owner'} mode="audit"/>;
    case 'crawlers':return <TechnicalCenter key="crawlers" owner={identity.role==='owner'} mode="crawlers"/>;
    case 'team':return <TeamDirectory/>;
    case 'security':return <SecurityCenter/>;
    case 'settings':return <AccountSettings identity={identity}/>;
  }
}
