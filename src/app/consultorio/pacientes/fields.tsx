import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RELATIONSHIPS } from "@/modules/clinic/format";

export const controlClass = "h-11 text-base";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="flex flex-col items-stretch gap-2 text-sm">
      {label}
      {children}
    </Label>
  );
}

export function TextControl({
  label,
  name,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  return (
    <Field label={label}>
      <Input
        name={name}
        value={value}
        autoComplete={autoComplete}
        className={controlClass}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function RelationshipSelect({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Parentesco">
      <select
        name={name}
        value={value}
        required
        className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione</option>
        {RELATIONSHIPS.map(([relationship, label]) => (
          <option key={relationship} value={relationship}>
            {label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function NotesField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Observações">
      <Textarea
        name="notes"
        value={value}
        maxLength={2000}
        className="min-h-28 text-base"
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
