import { UploadForm } from "./upload-form";

export const instant = false;

export default function H1BodyPage() {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-col gap-4 px-4 py-16">
      <h1 className="text-xl">Corpo da ação</h1>
      <UploadForm />
    </main>
  );
}
