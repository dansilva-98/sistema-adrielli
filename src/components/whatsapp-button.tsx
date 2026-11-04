export function WhatsAppButton({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Conversar pelo WhatsApp"
      className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5v8A2.5 2.5 0 0 1 15.5 15H10l-4 3.5V15h-.5A2.5 2.5 0 0 1 3 12.5v-8A2.5 2.5 0 0 1 6 4.5Z" />
      </svg>
    </a>
  );
}
