'use client';

import { useEffect, useRef, useState } from 'react';
import { Glyph } from './expansion-lab';
import styles from './expansion.module.css';

type Chapter = {
  id: string;
  n: string;
  title: string;
  icon: 'globe' | 'grid' | 'spark' | 'branch';
};

export function ChapterNavigator({ chapters }: { chapters: readonly Chapter[] }) {
  const nav = useRef<HTMLElement>(null);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const rail = nav.current;
    if (!rail) return;
    const sections = chapters.map(chapter => document.getElementById(chapter.id));
    const studio = rail.closest('section');
    let frame = 0;
    let selected = -1;

    function update() {
      if (!rail || !studio) return;
      const bounds = studio.getBoundingClientRect();
      if (bounds.top >= innerHeight || bounds.bottom <= 72) return;
      // Leave room for the sticky rail and the browser's fragment scroll offset.
      const boundary = Math.min(innerHeight - 24, 188 + rail.offsetHeight);
      const positions = sections.map(section => section?.getBoundingClientRect());
      const current = positions.findLastIndex(position => position && position.top <= boundary);
      const chapter = positions[current];
      if (chapter) {
        const end = positions[current + 1]?.top ?? chapter.bottom;
        const fraction = (boundary - chapter.top) / Math.max(1, end - chapter.top);
        rail.style.setProperty('--cedar-chapter-progress', String(Math.min(1, Math.max(0, fraction))));
      }

      if (selected !== current) {
        selected = current;
        setActive(current);
      }
    }

    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    }

    schedule();
    const size = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (studio) size?.observe(studio);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', schedule);
    return () => {
      size?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', schedule);
      cancelAnimationFrame(frame);
    };
  }, [chapters]);

  useEffect(() => {
    const rail = nav.current;
    const link = rail?.querySelector<HTMLAnchorElement>('[aria-current="location"]');
    if (!rail || !link || rail.scrollWidth <= rail.clientWidth || rail.matches(':focus-within')) return;
    const bounds = rail.getBoundingClientRect();
    const item = link.getBoundingClientRect();
    if (item.left >= bounds.left - 1 && item.right <= bounds.right + 1) return;
    const left = Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, rail.scrollLeft + item.left - bounds.left - 8));
    if (Math.abs(rail.scrollLeft - left) < 1) return;
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollTo({ left, behavior: animate ? 'smooth' : 'instant' });
  }, [active]);

  return <div className={styles.chapterRail}>
    <nav ref={nav} className={styles.chapterNav} data-cedar-chapter-nav aria-label="Solution chapters">
      {chapters.map((chapter, index) => <a
        key={chapter.id} href={'#' + chapter.id} data-nav-tone={chapter.id}
        aria-current={active === index ? 'location' : undefined}
      >
        <span><Glyph name={chapter.icon} />{chapter.title}</span><small aria-hidden="true">{chapter.n} ↘</small>
      </a>)}
    </nav>
  </div>;
}
