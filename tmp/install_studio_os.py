
# Save as /tmp/install_studio_os.py, then run with python3.
from pathlib import Path

root = Path("frontend/components/workspace")
shell_path = root / "shell.tsx"
css_path = root / "workspace.module.css"
nav_path = root / "studio-navigation.tsx"

shell = shell_path.read_text()
css = css_path.read_text()
navigation = (root / "navigation.ts").read_text()

required = [
    "const items = navigation.filter",
    "function allowWorkspaceLeave()",
    "const current = items.find",
    '<nav aria-label="Workspace navigation"',
    'className={styles.siteLink}',
    'import styles from \'./workspace.module.css\';',
]

if not all(value in shell for value in required):
    raise SystemExit("Unsupported WorkspaceShell baseline. No files changed.")

if not all(
    f"'{section}'" in navigation
    for section in ["content", "calendar", "website", "competitors", "crawlers"]
):
    raise SystemExit("V1.9.5.1 navigation baseline required.")

if nav_path.exists() or "Studio OS foundations" in css:
    raise SystemExit("Studio OS already installed or target file exists.")

start = shell.index('<nav aria-label="Workspace navigation"')
end = shell.index("</nav>", start) + len("</nav>")

shell = (
    shell[:start]
    + """<StudioNavigation
          items={items}
          pathname={pathname}
          collapsed={collapsed}
          expand={() => setCollapsed(false)}
          icon={name => <WorkspaceIcon name={name}/>}
          onNavigate={studioNavigate}
        />"""
    + shell[end:]
)

anchor = "const current = items.find"
position = shell.index(anchor)
position = shell.index(";", position) + 1

shell = shell[:position] + """
  const studioNavigate = (
    event: import('react').MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (
      href !== pathname &&
      !event.metaKey && !event.ctrlKey &&
      !event.shiftKey && !event.altKey &&
      event.button === 0 &&
      !allowWorkspaceLeave()
    ) {
      event.preventDefault();
      return false;
    }
    setOpen(false);
    return true;
  };
""" + shell[position:]

shell = shell.replace(
    "import styles from './workspace.module.css';",
    """import styles from './workspace.module.css';
import {
  StudioNavigation,
  StudioCommand
} from './studio-navigation';""",
    1
)

anchor = '<Link href="/" className={styles.siteLink}'
if shell.count(anchor) != 1:
    raise SystemExit("Unexpected website link. No files changed.")

shell = shell.replace(
    anchor,
    """<StudioCommand
      items={items}
      icon={name => <WorkspaceIcon name={name}/>}
      onNavigate={studioNavigate}
    />
    """ + anchor,
    1
)

component = r"""'use client';

import Link from 'next/link';
import {
  useEffect, useRef, useState,
  type ReactNode, type MouseEvent
} from 'react';
import type { NavItem, Section } from './navigation';
import styles from './workspace.module.css';

type SharedProps = {
  items: NavItem[];
  icon: (name: Section) => ReactNode;
  onNavigate: (
    event: MouseEvent<HTMLAnchorElement>,
    href: string
  ) => boolean;
};

const groups: {
  id: string;
  label: string;
  icon: Section;
  sections: Section[];
}[] = [
  {
    id: 'sales', label: 'Sales & CRM', icon: 'clients',
    sections: ['leads', 'clients', 'quotations']
  },
  {
    id: 'content', label: 'Content studio', icon: 'content',
    sections: ['content', 'blog', 'calendar', 'media', 'editorial']
  },
  {
    id: 'growth', label: 'Growth intelligence', icon: 'competitors',
    sections: ['competitors', 'seo', 'aeo', 'geo', 'monitoring']
  },
  {
    id: 'website', label: 'Website studio', icon: 'website',
    sections: ['website', 'audit', 'crawlers']
  },
  {
    id: 'settings', label: 'Settings', icon: 'settings',
    sections: ['settings', 'team', 'security']
  }
];

export function StudioNavigation({
  items, icon, onNavigate, pathname, collapsed, expand
}: SharedProps & {
  pathname: string;
  collapsed: boolean;
  expand: () => void;
}) {
  const current = items.find(item => item.href === pathname);
  const active = groups.find(group =>
    current && group.sections.includes(current.id)
  )?.id;

  const [selection, setSelection] = useState<{
    path: string;
    group: string | null;
  } | null>(null);

  const expanded = selection?.path === pathname
    ? selection.group
    : active ?? 'sales';

  const overview = items.find(item => item.id === 'overview');

  return (
    <nav
      aria-label="Workspace navigation"
      className={styles.studioNavigation}
    >
      <p className={styles.studioSectionLabel}>WORKSPACE</p>

      {overview && (
        <Link
          href={overview.href}
          prefetch={false}
          className={styles.studioNavLink}
          title="Overview"
          aria-current={pathname === overview.href ? 'page' : undefined}
          onClick={event => onNavigate(event, overview.href)}
        >
          {icon('overview')}
          <span className={styles.studioNavText}>Overview</span>
        </Link>
      )}

      {groups.map(group => {
        const children = group.sections.flatMap(id =>
          items.filter(item => item.id === id)
        );

        if (!children.length) return null;

        const open = expanded === group.id;

        return (
          <div className={styles.studioGroup} key={group.id}>
            <button
              type="button"
              className={styles.studioGroupButton}
              title={group.label}
              aria-label={group.label}
              aria-expanded={open}
              aria-controls={`studio-group-${group.id}`}
              data-active={active === group.id}
              onClick={() => {
                if (collapsed) {
                  expand();
                  setSelection({path: pathname, group: group.id});
                  return;
                }
                setSelection({
                  path: pathname,
                  group: open ? null : group.id
                });
              }}
            >
              {icon(group.icon)}
              <span className={styles.studioNavText}>
                {group.label}
              </span>
              <span
                aria-hidden="true"
                className={styles.studioChevron}
                data-open={open}
              >›</span>
            </button>

            <div
              id={`studio-group-${group.id}`}
              className={styles.studioChildren}
              hidden={!open}
            >
              {children.map(item => (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={false}
                  className={styles.studioChild}
                  aria-current={
                    item.href === pathname ? 'page' : undefined
                  }
                  title={item.label}
                  onClick={event => onNavigate(event, item.href)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function StudioCommand({
  items, icon, onNavigate
}: SharedProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  function show() {
    const node = dialog.current;
    if (!node || node.open) return;
    setQuery('');
    node.showModal();
    input.current?.focus();
  }

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        show();
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  const term = query.trim().toLowerCase();

  const matches = items.filter(item => {
    const group = groups.find(g => g.sections.includes(item.id));
    return `${item.label} ${group?.label ?? ''} ${item.href}`
      .toLowerCase().includes(term);
  });

  return (
    <>
      <button
        type="button"
        className={styles.studioSearch}
        aria-label="Find a workspace page"
        aria-haspopup="dialog"
        onClick={show}
      >
        {icon('seo')}
        <span>Find a page...</span>
        <kbd>⌘ K</kbd>
      </button>

      <dialog
        ref={dialog}
        className={styles.studioDialog}
        aria-labelledby="studio-command-title"
        onClick={event => {
          if (event.target === event.currentTarget) {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            ) dialog.current?.close();
          }
        }}
        onKeyDown={event => {
          const links = Array.from(
            dialog.current?.querySelectorAll<HTMLAnchorElement>(
              '[data-command-result]'
            ) ?? []
          );
          const index = links.indexOf(
            document.activeElement as HTMLAnchorElement
          );
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            links[(index + 1) % links.length]?.focus();
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (index <= 0) input.current?.focus();
            else links[index - 1]?.focus();
          } else if (
            event.key === 'Enter' &&
            event.target === input.current &&
            links.length
          ) {
            event.preventDefault();
            links[0].click();
          }
        }}
      >
        <div className={styles.studioCommandHeading}>
          <h2 id="studio-command-title">Navigate</h2>
          <button
            type="button"
            aria-label="Close navigation search"
            onClick={() => dialog.current?.close()}
          >Esc</button>
        </div>
        <input
          ref={input}
          className={styles.studioCommandInput}
          aria-label="Search workspace pages"
          placeholder="Search pages, tools and workspaces..."
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <div className={styles.studioResults}>
          {matches.map(item => (
            <Link
              data-command-result
              key={item.id}
              href={item.href}
              prefetch={false}
              onClick={event => {
                if (onNavigate(event, item.href)) {
                  dialog.current?.close();
                }
              }}
            >
              {icon(item.id)}
              <span>{item.label}</span>
              <small>
                {groups.find(g =>
                  g.sections.includes(item.id)
                )?.label ?? 'Workspace'}
              </small>
            </Link>
          ))}
          {!matches.length && (
            <p role="status">No matching workspace pages.</p>
          )}
        </div>
        <div className={styles.studioCommandFooter}>
          ↑ ↓ Navigate · Enter Open · Esc Close
        </div>
      </dialog>
    </>
  );
}
"""

tokens = r"""

/* Studio OS foundations — v1.9.5.2 */

.shell,.gate{
  --ws-bg:#fff;
  --ws-panel:#fff;
  --ws-sidebar:#f4f5f6;
  --ws-line:#dfe2e5;
  --ws-ink:#25292e;
  --ws-muted:#68717e;
  --ws-accent:#4c6c98;
  --ws-primary:#29374c;
  --ws-selected:#e2e7ee;
  --ws-radius:6px;
  --ws-control-height:34px;
  --ws-motion:160ms;
  background:var(--ws-bg);
  color:var(--ws-ink);
  font-family:Inter,-apple-system,BlinkMacSystemFont,
    "Segoe UI",sans-serif;
  font-size:13px;
}
.shell .sidebar{
  background:var(--ws-sidebar);
  gap:22px;
}
.shell .topbar{
  height:54px;
  background:#fff;
  gap:12px;
}
.shell .main{
  padding-top:28px;
}
.shell .pageHeading h1{
  font-size:27px;
  font-weight:650;
  letter-spacing:-.04em;
}
.shell .panel,.shell .metrics{
  border-radius:var(--ws-radius);
  box-shadow:none;
}
.studioNavigation,.studioGroup{
  display:grid;
  gap:3px;
  min-width:0;
}
.studioSectionLabel{
  padding:0 9px;
  margin:0 0 8px;
  font-size:10px;
  font-weight:600;
  letter-spacing:.07em;
  color:var(--ws-muted);
}
.studioNavLink,.studioGroupButton{
  width:100%;
  min-height:37px;
  display:flex;
  align-items:center;
  gap:10px;
  padding:8px 10px;
  color:#46505d;
  border:0;
  border-radius:var(--ws-radius);
  background:transparent;
  font:inherit;
  font-weight:500;
  text-align:left;
  text-decoration:none;
  cursor:pointer;
  transition:background var(--ws-motion) ease,
    color var(--ws-motion) ease;
}
.studioNavLink svg,.studioGroupButton svg{
  flex-shrink:0;
  width:17px;
  height:17px;
}
.studioNavLink:hover,.studioGroupButton:hover{
  background:#e9ebee;
  color:var(--ws-ink);
}
.studioNavLink[aria-current=page],
.studioGroupButton[data-active=true]{
  background:var(--ws-selected);
  color:#293f5e;
  font-weight:600;
}
.studioNavText{
  flex:1;
  min-width:0;
}
.studioChevron{
  font-size:17px;
  line-height:1;
  color:var(--ws-muted);
  transition:transform var(--ws-motion) ease;
}
.studioChevron[data-open=true]{
  transform:rotate(90deg);
}
.studioChildren{
  display:grid;
  gap:2px;
  border-left:1px solid #d7dce2;
  margin:3px 0 6px 18px;
  padding-left:9px;
}
.studioChildren[hidden]{
  display:none;
}
.studioChild{
  padding:7px 10px;
  border-radius:4px;
  color:#616a76;
  font-size:12px;
  line-height:1.4;
  text-decoration:none;
  overflow-wrap:anywhere;
}
.studioChild:hover{
  background:#e9ebee;
  color:var(--ws-ink);
}
.studioChild[aria-current=page]{
  background:var(--ws-selected);
  color:#293f5e;
  font-weight:600;
}
.studioSearch{
  display:flex;
  align-items:center;
  gap:8px;
  margin-left:auto;
  min-height:32px;
  padding:5px 10px;
  border:1px solid var(--ws-line);
  border-radius:6px;
  color:var(--ws-muted);
  background:#fafafa;
  font:inherit;
  white-space:nowrap;
  cursor:pointer;
}
.studioSearch svg{
  width:16px;
  height:16px;
}
.studioSearch kbd{
  padding:1px 4px;
  margin-left:12px;
  border:1px solid var(--ws-line);
  border-radius:3px;
  font-size:10px;
}
.shell .studioSearch~.siteLink{
  margin-left:0;
}
.studioDialog{
  position:fixed;
  inset:0;
  margin:auto;
  width:min(540px,calc(100vw - 24px));
  max-height:min(620px,85dvh);
  padding:0;
  border:1px solid var(--ws-line);
  border-radius:12px;
  background:#fff;
  color:var(--ws-ink);
  box-shadow:0 20px 70px #141c3026;
  overflow:auto;
}
.studioDialog::backdrop{
  background:rgba(28,35,46,.32);
}
.studioCommandHeading{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:16px 18px 10px;
}
.studioCommandHeading h2{
  margin:0;
  font-size:15px;
  line-height:1.4;
  font-weight:600;
  color:var(--ws-ink);
}
.studioCommandHeading button{
  border:1px solid var(--ws-line);
  background:#fff;
  color:var(--ws-muted);
  border-radius:4px;
  font-size:11px;
  padding:4px 7px;
}
.studioCommandInput{
  display:block;
  width:calc(100% - 36px);
  min-height:42px;
  margin:0 18px 12px;
  padding:10px 12px;
  border:1px solid var(--ws-line);
  border-radius:6px;
  background:#fff;
  color:var(--ws-ink);
  font:inherit;
}
.studioResults{
  padding:6px 12px;
  max-height:350px;
  overflow:auto;
  border-top:1px solid var(--ws-line);
}
.studioResults a{
  display:flex;
  align-items:center;
  gap:10px;
  padding:11px 10px;
  border-radius:5px;
  color:var(--ws-ink);
  text-decoration:none;
}
.studioResults a:hover,.studioResults a:focus-visible{
  background:var(--ws-selected);
}
.studioResults a svg{
  flex-shrink:0;
  width:17px;
  height:17px;
  color:var(--ws-muted);
}
.studioResults a span{flex:1}
.studioResults a small{
  color:var(--ws-muted);
  font-size:11px;
}
.studioResults p{
  padding:12px;
  color:var(--ws-muted);
}
.studioCommandFooter{
  padding:12px 18px;
  border-top:1px solid var(--ws-line);
  color:var(--ws-muted);
  font-size:11px;
}
@media(min-width:761px){
  .shell{grid-template-columns:240px minmax(0,1fr)}
  .shell.collapsed{grid-template-columns:64px minmax(0,1fr)}
  .collapsed .studioNavText,
  .collapsed .studioChevron,
  .collapsed .studioSectionLabel,
  .collapsed .studioChildren{
    display:none;
  }
  .collapsed .studioNavLink,
  .collapsed .studioGroupButton{
    justify-content:center;
    padding:10px;
  }
}
@media(max-width:760px){
  .shell .sidebar{gap:14px}
  .shell .main{padding:22px 15px 36px}
  .shell .topbar{gap:8px;padding-inline:12px}
  .studioSearch span,.studioSearch kbd{display:none}
  .studioSearch{padding:7px}
  .studioResults a small{display:none}
  .shell .breadcrumb{min-width:0}
  .shell .breadcrumb strong{
    overflow:hidden;
    white-space:nowrap;
    text-overflow:ellipsis;
  }
}
@media(prefers-reduced-motion:reduce){
  .studioNavLink,.studioGroupButton,.studioChevron{
    transition:none;
  }
}
"""

# All baseline checks completed before writing.
nav_path.write_text(component)
shell_path.write_text(shell)
css_path.write_text(css + tokens)

print("Studio OS foundation installed.")
print("Changed: shell.tsx, workspace.module.css")
print("Added: studio-navigation.tsx")
print("Run git diff --check and frontend typecheck before use.")


