"use client";

import { CheckIcon } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

export const STEP_COUNT_MIN = 3;
export const STEP_COUNT_MAX = 6;

export type StepTrackItem = {
  title: string;
  body?: string;
};

export type StepTrackVariant = "static" | "tabs" | "progress" | "vertical";
export type StepTrackMarkers = "numbers" | "dots";

export type StepTrackProps = {
  steps: readonly StepTrackItem[];
  variant: StepTrackVariant;
  labelledBy?: string;
  currentIndex?: number;
  markers?: StepTrackMarkers;
  lastAccent?: boolean;
  collapsible?: boolean;
  panelNav?: boolean;
};

type MarkerTone = "active" | "inactive" | "completed" | "filled" | "filled-support";

export function isValidStepCount(count: number): boolean {
  return count >= STEP_COUNT_MIN && count <= STEP_COUNT_MAX;
}

export function stepIndexAfterKey(
  current: number,
  count: number,
  key: string,
): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function stepAriaLabel(index: number, title: string, numbered: boolean): string {
  const label = title.trim() || "Etapa";
  return numbered ? `Etapa ${index + 1}: ${label}` : label;
}

function clampIndex(index: number | undefined, count: number): number {
  if (index == null || !Number.isInteger(index)) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

function markerTone(options: {
  variant: StepTrackVariant;
  index: number;
  currentIndex: number;
  count: number;
  lastAccent: boolean;
  hasCurrent: boolean;
}): MarkerTone {
  const { variant, index, currentIndex, count, lastAccent, hasCurrent } = options;
  if (variant === "progress") {
    if (index < currentIndex) return "completed";
    if (index === currentIndex) return "active";
    return "inactive";
  }
  if (variant === "tabs" || variant === "vertical") {
    return index === currentIndex ? "active" : "inactive";
  }
  if (hasCurrent && index === currentIndex) return "active";
  if (lastAccent && index === count - 1) return "filled-support";
  return "filled";
}

function toneClass(tone: MarkerTone): string {
  switch (tone) {
    case "active":
      return "bg-primary text-primary-foreground ring-[6px] ring-gold-light";
    case "inactive":
      return "border-2 border-gold bg-surface text-primary";
    case "completed":
      return "bg-support text-support-foreground";
    case "filled-support":
      return "bg-support text-support-foreground";
    default:
      return "bg-primary text-primary-foreground";
  }
}

function MarkerFace({
  index,
  tone,
  markers,
}: {
  index: number;
  tone: MarkerTone;
  markers: StepTrackMarkers;
}) {
  const numbered = markers === "numbers";
  return (
    <span
      className={cn(
        "relative z-10 inline-flex shrink-0 items-center justify-center rounded-full font-sans",
        numbered ? "size-11 text-sm sm:size-10" : "size-6",
        toneClass(tone),
      )}
      aria-hidden="true"
    >
      {tone === "completed" ? (
        <CheckIcon className="size-4" strokeWidth={2.5} />
      ) : numbered ? (
        index + 1
      ) : null}
    </span>
  );
}

function TrackLine({
  axis,
  markers,
}: {
  axis: "horizontal" | "vertical";
  markers: StepTrackMarkers;
}) {
  const start =
    markers === "dots"
      ? "left-3 top-3"
      : "left-[1.375rem] top-[1.375rem] sm:left-5 sm:top-5";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute bg-gold",
        start,
        axis === "horizontal"
          ? markers === "dots"
            ? "right-3 h-0.5"
            : "right-[1.375rem] h-0.5 sm:right-5"
          : "bottom-5 w-0.5",
      )}
    />
  );
}

function StepLabel({
  title,
  hideOnMobile = false,
}: {
  title: string;
  hideOnMobile?: boolean;
}) {
  return (
    <span
      aria-hidden={hideOnMobile || undefined}
      className={cn(
        "mt-2 text-center text-text",
        hideOnMobile
          ? "hidden font-serif text-[1.3125rem] sm:block sm:text-2xl"
          : "font-sans text-sm sm:font-serif sm:text-[1.3125rem] sm:text-2xl",
      )}
    >
      {hideOnMobile ? "\u200B" : null}
      {title}
    </span>
  );
}

function StepIndex({ index, numbered }: { index: number; numbered: boolean }) {
  if (!numbered) return null;
  return <span className="sr-only">{`Etapa ${index + 1}:`}</span>;
}

export function StepTrack({
  steps,
  variant,
  labelledBy,
  currentIndex,
  markers = "numbers",
  lastAccent = false,
  collapsible = variant === "vertical",
  panelNav = false,
}: StepTrackProps) {
  const count = steps.length;
  if (!isValidStepCount(count)) return null;

  const numbered = markers === "numbers";
  const listLabel = labelledBy
    ? { "aria-labelledby": labelledBy }
    : { "aria-label": "Etapas" };

  if (variant === "tabs") {
    return (
      <TabsTrack
        steps={steps}
        markers={markers}
        numbered={numbered}
        listLabel={listLabel}
        currentIndex={currentIndex}
        panelNav={panelNav}
      />
    );
  }

  if (variant === "vertical") {
    return (
      <VerticalTrack
        steps={steps}
        markers={markers}
        numbered={numbered}
        listLabel={listLabel}
        currentIndex={currentIndex}
        lastAccent={lastAccent}
        collapsible={collapsible}
      />
    );
  }

  const hasCurrent = currentIndex != null;
  const activeIndex = hasCurrent ? clampIndex(currentIndex, count) : 0;

  return (
    <div className="relative">
      <TrackLine axis="horizontal" markers={markers} />
      <ol className="relative flex list-none justify-between gap-2 p-0" {...listLabel}>
        {steps.map((step, index) => {
          const tone = markerTone({
            variant,
            index,
            currentIndex: activeIndex,
            count,
            lastAccent,
            hasCurrent,
          });
          const current = variant === "progress" && index === activeIndex;
          return (
            <li
              key={`${step.title}-${index}`}
              className="flex min-w-0 flex-1 flex-col items-center"
              aria-current={current ? "step" : undefined}
            >
              <MarkerFace index={index} tone={tone} markers={markers} />
              <StepIndex index={index} numbered={numbered} />
              <StepLabel title={step.title} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TabsTrack({
  steps,
  markers,
  numbered,
  listLabel,
  currentIndex,
  panelNav,
}: {
  steps: readonly StepTrackItem[];
  markers: StepTrackMarkers;
  numbered: boolean;
  listLabel: { "aria-labelledby": string } | { "aria-label": string };
  currentIndex?: number;
  panelNav: boolean;
}) {
  const count = steps.length;
  const baseId = useId();
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [active, setActive] = useState(() => clampIndex(currentIndex, count));
  const current = steps[active];
  if (!current) return null;

  const activate = (index: number) => {
    const next = clampIndex(index, count);
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
    <div>
      <div className="relative max-sm:mr-14">
        <TrackLine axis="horizontal" markers={markers} />
        <div
          role="tablist"
          className="relative flex justify-between gap-2"
          {...listLabel}
        >
          {steps.map((step, index) => {
            const selected = index === active;
            return (
              <button
                key={`${step.title}-${index}`}
                ref={(node) => {
                  tabsRef.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${index}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                aria-label={stepAriaLabel(index, step.title, numbered)}
                tabIndex={selected ? 0 : -1}
                className="flex min-h-11 min-w-11 flex-col items-center rounded-sm bg-transparent p-0 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-1"
                onClick={() => activate(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <MarkerFace
                  index={index}
                  tone={markerTone({
                    variant: "tabs",
                    index,
                    currentIndex: active,
                    count,
                    lastAccent: false,
                    hasCurrent: true,
                  })}
                  markers={markers}
                />
                <StepLabel hideOnMobile title={step.title} />
              </button>
            );
          })}
        </div>
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className="mt-6 rounded-lg border border-line bg-popover p-6 transition-opacity motion-reduce:transition-none sm:p-10"
      >
        {panelNav ? (
          <p className="font-sans text-sm text-muted">{`Etapa ${active + 1} de ${count}`}</p>
        ) : null}
        {current.title ? (
          <p className="font-serif text-xl text-text sm:text-2xl">{current.title}</p>
        ) : null}
        {current.body ? (
          <p className="mt-2 max-w-prose font-sans text-text">{current.body}</p>
        ) : null}
        {panelNav ? (
          <div className="mt-6 flex gap-4">
            <button
              type="button"
              className="inline-flex min-h-11 items-center font-sans text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:text-muted disabled:no-underline"
              disabled={active === 0}
              onClick={() => activate(active - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center font-sans text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:text-muted disabled:no-underline"
              disabled={active === count - 1}
              onClick={() => activate(active + 1)}
            >
              Próxima etapa
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function VerticalTrack({
  steps,
  markers,
  numbered,
  listLabel,
  currentIndex,
  lastAccent,
  collapsible,
}: {
  steps: readonly StepTrackItem[];
  markers: StepTrackMarkers;
  numbered: boolean;
  listLabel: { "aria-labelledby": string } | { "aria-label": string };
  currentIndex?: number;
  lastAccent: boolean;
  collapsible: boolean;
}) {
  const count = steps.length;
  const baseId = useId();
  const headersRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(() => clampIndex(currentIndex, count));

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = stepIndexAfterKey(index, count, event.key);
    if (next != null) {
      event.preventDefault();
      headersRef.current[next]?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(index);
    }
  };

  return (
    <div className="relative">
      <TrackLine axis="vertical" markers={markers} />
      <ol className="relative flex list-none flex-col gap-6 p-0" {...listLabel}>
        {steps.map((step, index) => {
          const expanded = open === index;
          const tone = markerTone({
            variant: collapsible ? "vertical" : "static",
            index,
            currentIndex: open,
            count,
            lastAccent,
            hasCurrent: collapsible || currentIndex != null,
          });
          const panelId = `${baseId}-panel-${index}`;
          return (
            <li key={`${step.title}-${index}`} className="flex gap-4">
              <MarkerFace index={index} tone={tone} markers={markers} />
              <div className="min-w-0 flex-1">
                {collapsible ? (
                  <button
                    ref={(node) => {
                      headersRef.current[index] = node;
                    }}
                    type="button"
                    id={`${baseId}-header-${index}`}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    className="min-h-11 w-full rounded-sm bg-transparent p-0 text-left font-serif text-xl text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-2xl"
                    onClick={() => setOpen(index)}
                    onKeyDown={(event) => onKeyDown(event, index)}
                  >
                    <StepIndex index={index} numbered={numbered} />
                    {step.title}
                  </button>
                ) : (
                  <p className="font-serif text-xl text-text sm:text-2xl">
                    <StepIndex index={index} numbered={numbered} />
                    {step.title}
                  </p>
                )}
                {collapsible ? (
                  <div
                    id={panelId}
                    role="region"
                    hidden={!expanded}
                    className="mt-2 max-w-prose font-sans text-text transition-opacity motion-reduce:transition-none"
                  >
                    {expanded && step.body ? <p>{step.body}</p> : null}
                  </div>
                ) : step.body ? (
                  <p className="mt-2 max-w-prose font-sans text-text">{step.body}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
