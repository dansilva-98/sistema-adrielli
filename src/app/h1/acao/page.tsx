import { ProbeForm } from "./probe-form";

export const instant = false;

export default function H1ActionPage() {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-col gap-4 px-4 py-16">
      <h1 className="text-xl">Ação temporária</h1>
      <ProbeForm />
    </main>
  );
}
