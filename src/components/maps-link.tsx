import { MAPS_LINK_LABEL, MAPS_LINK_TEXT, mapsSearchUrl } from "@/modules/content/maps";

export function MapsLink({ address }: { address: string | null | undefined }) {
  const href = mapsSearchUrl(address);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={MAPS_LINK_LABEL}
      className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {MAPS_LINK_TEXT}
    </a>
  );
}
