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
        <path d="M6.7 3.9c.4-.8 1.3-1.1 2-.7l1.8.9c.6.3.9 1 .7 1.6l-.7 1.8c-.2.5 0 1 .4 1.3l1.1.8a8.5 8.5 0 0 0 3.4 3.4l.8 1.1c.3.4.8.6 1.3.4l1.8-.7c.6-.2 1.3.1 1.6.7l.9 1.8c.4.7.1 1.6-.7 2l-1.5.7c-.8.4-1.7.3-2.4-.2-2.2-1.6-5.4-4.8-7-7-.5-.7-.6-1.6-.2-2.4l.7-1.5Z" />
      </svg>
    </a>
  );
}
