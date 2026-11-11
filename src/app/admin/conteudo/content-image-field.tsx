"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export function ContentImageField({
  id,
  label,
  help,
  warning,
  src,
  alt,
  error,
  fileName = "image",
  removeTrigger = "Remover",
  onFile,
  onRemove,
}: {
  id: string;
  label: string;
  help: string;
  warning?: string;
  src: string | null;
  alt: string;
  error?: string;
  fileName?: string;
  removeTrigger?: string;
  onFile: (file: File | null) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-sm text-muted">{help}</p>
      {warning ? <p className="text-sm text-muted">{warning}</p> : null}
      {src ? (
        // A prévia é local ou do bucket público; o alt fica no campo ao lado.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="max-h-48 w-auto rounded-lg" />
      ) : (
        <p className="text-sm text-muted">Nenhuma imagem.</p>
      )}
      <Label htmlFor={id}>Trocar imagem</Label>
      <input
        id={id}
        name={fileName}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {src ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button type="button" variant="outline" />}>
            {removeTrigger}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remover a imagem</DialogTitle>
              <DialogDescription>Ela sai do site quando você salvar.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  onRemove();
                  setOpen(false);
                }}
              >
                Remover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
