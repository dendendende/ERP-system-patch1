"use client";

import { useEffect, useState } from "react";

/** The object page's jump nav: sticks to the top, and marks the section being read. */
export function SectionNav({ sections }: { sections: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState(sections[0]?.id);

  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (changes) => {
        for (const c of changes) seen.set(c.target.id, c.isIntersecting);
        // the first section (top to bottom) that's in the reading band
        const first = sections.find((s) => seen.get(s.id));
        if (first) setCurrent(first.id);
      },
      // the band just under the sticky nav
      { rootMargin: "-64px 0px -55% 0px" },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Sections"
      className="sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto border-b border-line bg-ground/90 px-1 py-2 backdrop-blur"
    >
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={() => setCurrent(s.id)}
          aria-current={current === s.id ? "location" : undefined}
          className="shrink-0 rounded-full px-3 py-1 text-sm whitespace-nowrap text-muted transition-colors hover:text-ink aria-[current]:bg-brand-soft aria-[current]:font-medium aria-[current]:text-brand-deep"
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
