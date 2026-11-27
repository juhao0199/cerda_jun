'use client';

import { useEffect, useRef, type ReactNode } from 'react';

const targets = '[data-cedar-reveal]';

function watchEntrances(root: HTMLElement) {
  const waiting = new WeakSet<Element>();
  const observed = new WeakSet<Element>();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const element = entry.target;
      if (!entry.isIntersecting) {
        if (entry.rootBounds && entry.boundingClientRect.top >= entry.rootBounds.bottom) {
          waiting.add(element);
        }
        if (entry.boundingClientRect.bottom <= 0) observer.unobserve(element);
        continue;
      }

      // Content already in view on load or restored by the browser stays still.
      if (waiting.has(element) && !element.matches(':focus-visible') && !element.querySelector(':focus-visible')) {
        element.setAttribute('data-cedar-entered', '');
      }
      observer.unobserve(element);
    }
  });

  function observe(element: Element) {
    if (observed.has(element)) return;
    observed.add(element);
    observer.observe(element);
  }

  function visit(node: Node, callback: (element: Element) => void) {
    if (!(node instanceof Element)) return;
    if (node.matches(targets)) callback(node);
    node.querySelectorAll(targets).forEach(callback);
  }

  visit(root, observe);
  const changes = new MutationObserver(records => {
    for (const record of records) {
      record.removedNodes.forEach(node => visit(node, element => {
        if (root.contains(element)) return;
        observer.unobserve(element);
        waiting.delete(element);
        observed.delete(element);
      }));
      record.addedNodes.forEach(node => {
        if (root.contains(node)) visit(node, observe);
      });
    }
  });
  changes.observe(root, { childList: true, subtree: true });

  function settleFocus(event: FocusEvent) {
    if (!(event.target instanceof Element) || !event.target.matches(':focus-visible')) return;
    let element = event.target.closest(targets);
    while (element && root.contains(element)) {
      element.removeAttribute('data-cedar-entered');
      waiting.delete(element);
      element = element.parentElement?.closest(targets) ?? null;
    }
  }

  root.addEventListener('focusin', settleFocus);
  return () => {
    observer.disconnect();
    changes.disconnect();
    root.removeEventListener('focusin', settleFocus);
    root.querySelectorAll('[data-cedar-entered]').forEach(element => element.removeAttribute('data-cedar-entered'));
  };
}

function watchSpotlights(root: HTMLElement) {
  const preference = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  let frame = 0;
  let surface: HTMLElement | null = null;
  let pointerX = 0;
  let pointerY = 0;

  function clear() {
    surface?.removeAttribute('data-cedar-pointing');
    surface = null;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function move(event: PointerEvent) {
    if (!preference.matches || event.pointerType !== 'mouse') return;
    const next = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cedar-spotlight]') : null;
    if (next !== surface) {
      clear();
      surface = next;
    }
    if (!surface) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!surface) return;
      const bounds = surface.getBoundingClientRect();
      surface.style.setProperty('--cedar-light-x', String(pointerX - bounds.left) + 'px');
      surface.style.setProperty('--cedar-light-y', String(pointerY - bounds.top) + 'px');
      surface.setAttribute('data-cedar-pointing', '');
    });
  }

  function leave(event: PointerEvent) {
    if (surface && (!(event.relatedTarget instanceof Node) || !surface.contains(event.relatedTarget))) clear();
  }

  root.addEventListener('pointermove', move, { passive: true });
  root.addEventListener('pointerout', leave, { passive: true });
  preference.addEventListener('change', clear);
  window.addEventListener('blur', clear);
  return () => {
    clear();
    root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerout', leave);
    preference.removeEventListener('change', clear);
    window.removeEventListener('blur', clear);
  };
}

export function PublicMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;

    const stopSpotlights = watchSpotlights(element);
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let stop: (() => void) | undefined;
    const update = () => {
      stop?.();
      stop = !preference.matches && typeof IntersectionObserver !== 'undefined' ? watchEntrances(element) : undefined;
    };

    update();
    preference.addEventListener('change', update);
    return () => {
      preference.removeEventListener('change', update);
      stop?.();
      stopSpotlights();
    };
  }, []);

  return <div ref={root} data-cedar-public>{children}</div>;
}
