"use client";

import { ChevronDownIcon } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { stepIndexAfterKey } from "@/components/step-track";
import { cn } from "@/lib/utils";
import { RestrictedMarkdown } from "@/modules/content/markdown-view";
import type { PublicService } from "@/modules/content/queries";

import { SitePhoto } from "./site-photo";

export function ServiceList({
  services,
  whatsappUrl,
}: {
  services: readonly PublicService[];
  whatsappUrl: string | null;
}) {
  if (services.length === 0) return null;
  if (services.length === 1) {
    const service = services[0];
    if (!service) return null;
    return <ServiceCard service={service} whatsappUrl={whatsappUrl} heading />;
  }

  return (
    <>
      <div className="lg:hidden">
        <ServiceAccordion services={services} whatsappUrl={whatsappUrl} />
      </div>
      <div className="hidden lg:block">
        <ServiceTabs services={services} whatsappUrl={whatsappUrl} />
      </div>
    </>
  );
}

function ServiceCard({
  service,
  whatsappUrl,
  heading = false,
}: {
  service: PublicService;
  whatsappUrl: string | null;
  heading?: boolean;
}) {
  const Title = heading ? "h2" : "p";
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-line bg-popover p-6 sm:p-10">
      <Title className="font-serif text-2xl text-text">{service.title}</Title>
      {service.imagePath ? (
        <SitePhoto path={service.imagePath} alt={service.imageAlt ?? ""} />
      ) : null}
      {service.summary ? <p className="max-w-prose">{service.summary}</p> : null}
      {service.body ? (
        <div className="max-w-[65ch]">
          <RestrictedMarkdown source={service.body} />
        </div>
      ) : null}
      {whatsappUrl ? (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-fit items-center rounded-lg bg-primary px-4 text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Agendar avaliação
        </a>
      ) : null}
    </article>
  );
}

function ServiceTabs({
  services,
  whatsappUrl,
}: {
  services: readonly PublicService[];
  whatsappUrl: string | null;
}) {
  const count = services.length;
  const baseId = useId();
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [active, setActive] = useState(0);
  const current = services[active];
  if (!current) return null;

  const activate = (index: number) => {
    const next = Math.min(Math.max(index, 0), count - 1);
    setActive(next);
    tabsRef.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = stepIndexAfterKey(index, count, event.key);
    if (next == null) return;
    event.preventDefault();
    activate(next);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]">
      <div
        role="tablist"
        aria-label="Serviços"
        aria-orientation="vertical"
        className="flex flex-col"
      >
        {services.map((service, index) => {
          const selected = index === active;
          return (
            <button
              key={service.slug}
              ref={(node) => {
                tabsRef.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${index}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "min-h-11 border-b border-line px-4 py-3 text-left font-serif text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                selected ? "bg-popover text-primary" : "bg-transparent text-text",
              )}
              onClick={() => activate(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {service.title}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className="transition-opacity motion-reduce:transition-none"
      >
        <ServiceCard service={current} whatsappUrl={whatsappUrl} />
      </div>
    </div>
  );
}

function ServiceAccordion({
  services,
  whatsappUrl,
}: {
  services: readonly PublicService[];
  whatsappUrl: string | null;
}) {
  const baseId = useId();
  const [open, setOpen] = useState(0);

  return (
    <div className="flex flex-col">
      {services.map((service, index) => {
        const expanded = open === index;
        const panelId = `${baseId}-panel-${index}`;
        return (
          <div key={service.slug} className="border-t border-line last:border-b">
            <h2>
              <button
                type="button"
                id={`${baseId}-header-${index}`}
                aria-expanded={expanded}
                aria-controls={panelId}
                className="flex min-h-11 w-full items-center justify-between gap-3 bg-transparent py-3 text-left font-serif text-xl text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                onClick={() => setOpen(index)}
              >
                {service.title}
                <ChevronDownIcon
                  aria-hidden="true"
                  className={cn(
                    "size-5 shrink-0 transition-transform motion-reduce:transition-none",
                    expanded ? "rotate-180" : "rotate-0",
                  )}
                />
              </button>
            </h2>
            <div id={panelId} role="region" hidden={!expanded} className="pb-4">
              {expanded ? (
                <ServiceCard service={service} whatsappUrl={whatsappUrl} />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
