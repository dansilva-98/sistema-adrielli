"use client";

import { useRouter } from "next/navigation";

const sections = ["dados", "responsaveis", "anexos"] as const;
type Section = (typeof sections)[number];

function sectionHref(patientId: string, section: Section): string {
  const params = new URLSearchParams();
  if (section !== "dados") params.set("secao", section);
  const text = params.toString();
  const path = `/consultorio/pacientes/${patientId}`;
  return text ? `${path}?${text}` : path;
}

export function SectionNav({
  patientId,
  section,
}: {
  patientId: string;
  section: Section;
}) {
  const router = useRouter();
  const tabs: { id: Section; label: string }[] = [
    { id: "dados", label: "Dados" },
    { id: "responsaveis", label: "Responsáveis" },
    { id: "anexos", label: "Anexos" },
  ];

  function select(next: Section) {
    const href = sectionHref(patientId, next);
    window.history.replaceState(null, "", href);
    router.replace(href, { scroll: false });
  }

  return (
    <nav aria-label="Ficha" className="grid grid-cols-3 gap-1">
      {tabs.map((tab) => {
        const current = tab.id === section;
        const href = sectionHref(patientId, tab.id);
        return (
          <a
            key={tab.id}
            href={href}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "inline-flex h-11 items-center justify-center rounded-md bg-support px-1 text-center text-sm font-medium text-support-foreground"
                : "inline-flex h-11 items-center justify-center rounded-md border border-border px-1 text-center text-sm"
            }
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              select(tab.id);
            }}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
