'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { UploadCloud, X, FileImage, AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ApplicationFields } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type FormState = {
  beverage_type: ApplicationFields['beverage_type'];
  is_import: boolean;
  brand_name: string;
  class_type: string;
  abv: string;
  net_contents: string;
  bottler_name: string;
  bottler_address: string;
  country_of_origin: string;
};

type TextFields = Extract<
  keyof FormState,
  | 'brand_name'
  | 'class_type'
  | 'abv'
  | 'net_contents'
  | 'bottler_name'
  | 'bottler_address'
  | 'country_of_origin'
>;

interface Props {
  onSubmit: (formData: FormData) => void;
  loading: boolean;
  hasExistingResult: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitize(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[­​‌‍﻿]/g, '')
    .trim();
}

function computeErrors(state: FormState): Partial<Record<keyof FormState, string>> {
  const e: Partial<Record<keyof FormState, string>> = {};
  if (!state.brand_name.trim()) e.brand_name = 'Required';
  if (!state.class_type.trim()) e.class_type = 'Required';
  if (!state.abv.trim()) e.abv = 'Required';
  if (!state.net_contents.trim()) e.net_contents = 'Required';
  if (!state.bottler_name.trim()) e.bottler_name = 'Required';
  if (!state.bottler_address.trim()) e.bottler_address = 'Required';
  if (state.is_import && !state.country_of_origin.trim()) {
    e.country_of_origin = 'Required for imported products';
  }
  return e;
}

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;

const INITIAL_STATE: FormState = {
  beverage_type: 'distilled_spirits',
  is_import: false,
  brand_name: '',
  class_type: '',
  abv: '',
  net_contents: '',
  bottler_name: '',
  bottler_address: '',
  country_of_origin: '',
};

// ─── Field row ───────────────────────────────────────────────────────────────

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VerificationForm({ onSubmit, loading, hasExistingResult }: Props) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [imageErrors, setImageErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const errors = useMemo(() => computeErrors(form), [form]);
  const isFormValid = Object.keys(errors).length === 0 && images.length > 0;

  function err(field: keyof FormState): string | undefined {
    return (touched.has(field) || attempted) ? errors[field] : undefined;
  }

  // ── Text field handlers ──

  function handleChange(field: TextFields, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleBlur(field: TextFields) {
    const clean = sanitize(form[field]);
    setForm((prev) => ({ ...prev, [field]: clean }));
    setTouched((prev) => new Set(prev).add(field));
  }

  function textProps(field: TextFields) {
    return {
      id: field,
      value: form[field],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        handleChange(field, e.target.value),
      onBlur: () => handleBlur(field),
      disabled: loading,
      'aria-invalid': !!(err(field)),
      'aria-describedby': err(field) ? `${field}-error` : undefined,
    };
  }

  // ── Image handlers ──

  const validateAndAddFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return;

      const newErrors: string[] = [];
      const toAdd: File[] = [];
      const remaining = MAX_FILES - images.length;

      Array.from(incoming).forEach((file) => {
        if (toAdd.length >= remaining) {
          newErrors.push(`Maximum ${MAX_FILES} images allowed — extra files ignored.`);
          return;
        }
        if (!ACCEPTED_TYPES.has(file.type)) {
          newErrors.push(`"${file.name}": unsupported format. Accepted: JPEG, PNG.`);
          return;
        }
        if (file.size > MAX_BYTES) {
          newErrors.push(`"${file.name}": ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 10 MB limit.`);
          return;
        }
        toAdd.push(file);
      });

      setImages((prev) => [...prev, ...toAdd]);
      setImageErrors(newErrors);

      // reset input so the same file can be re-selected after removal
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [images.length]
  );

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImageErrors([]);
  }

  // ── Submit ──

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);

    if (!isFormValid) return;

    if (hasExistingResult) {
      const confirmed = window.confirm(
        'Starting a new verification will clear the current results. Continue?'
      );
      if (!confirmed) return;
    }

    const fields: ApplicationFields = {
      beverage_type: form.beverage_type,
      is_import: form.is_import,
      brand_name: sanitize(form.brand_name),
      class_type: sanitize(form.class_type),
      abv: sanitize(form.abv),
      net_contents: sanitize(form.net_contents),
      bottler_name: sanitize(form.bottler_name),
      bottler_address: sanitize(form.bottler_address),
      ...(form.is_import && form.country_of_origin
        ? { country_of_origin: sanitize(form.country_of_origin) }
        : {}),
    };

    const formData = new FormData();
    formData.append('fields', JSON.stringify(fields));
    images.forEach((img) => formData.append('images', img));

    // Reset attempted so errors don't bleed into next verification
    setAttempted(false);

    onSubmit(formData);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* Row 1: Beverage Type + Import Toggle */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="beverage_type" label="Beverage Type">
          <Select
            value={form.beverage_type}
            onValueChange={(v) =>
              setForm((prev) => ({
                ...prev,
                beverage_type: v as ApplicationFields['beverage_type'],
              }))
            }
            disabled={loading}
          >
            <SelectTrigger id="beverage_type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="distilled_spirits">Distilled Spirits</SelectItem>
              <SelectItem value="wine">Wine</SelectItem>
              <SelectItem value="malt_beverage">Malt Beverage</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field id="is_import" label="Origin">
          <div className="flex gap-0 rounded-lg border border-input overflow-hidden w-fit">
            <button
              type="button"
              disabled={loading}
              onClick={() => setForm((prev) => ({ ...prev, is_import: false, country_of_origin: '' }))}
              className={cn(
                'px-4 h-8 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none',
                !form.is_import
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-foreground hover:bg-muted'
              )}
            >
              Domestic
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setForm((prev) => ({ ...prev, is_import: true }))}
              className={cn(
                'px-4 h-8 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none',
                form.is_import
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-foreground hover:bg-muted'
              )}
            >
              Import
            </button>
          </div>
        </Field>
      </div>

      {/* Row 2: Brand Name + Class/Type */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="brand_name" label="Brand Name" error={err('brand_name')}>
          <Input placeholder="e.g. Old Tom Distillery" {...textProps('brand_name')} />
        </Field>
        <Field id="class_type" label="Class / Type" error={err('class_type')}>
          <Input placeholder="e.g. Kentucky Straight Bourbon Whiskey" {...textProps('class_type')} />
        </Field>
      </div>

      {/* Row 3: ABV + Net Contents */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="abv" label="Alcohol Content (ABV)" error={err('abv')}>
          <Input placeholder="e.g. 45% Alc./Vol." {...textProps('abv')} />
        </Field>
        <Field id="net_contents" label="Net Contents" error={err('net_contents')}>
          <Input placeholder="e.g. 750 mL" {...textProps('net_contents')} />
        </Field>
      </div>

      {/* Row 4: Bottler Name + Address */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="bottler_name" label="Bottler / Producer Name" error={err('bottler_name')}>
          <Input placeholder="e.g. Old Tom Distilling Co." {...textProps('bottler_name')} />
        </Field>
        <Field id="bottler_address" label="Bottler / Producer Address" error={err('bottler_address')}>
          <Input placeholder="e.g. 123 Bourbon St, Louisville, KY 40202" {...textProps('bottler_address')} />
        </Field>
      </div>

      {/* Conditional: Country of Origin */}
      {form.is_import && (
        <Field id="country_of_origin" label="Country of Origin" error={err('country_of_origin')}>
          <Input
            placeholder="e.g. Scotland"
            className="max-w-xs"
            {...textProps('country_of_origin')}
          />
        </Field>
      )}

      {/* Image Upload */}
      <div className="flex flex-col gap-2">
        <Label>Label Image(s)</Label>
        <p className="text-xs text-muted-foreground">
          JPEG or PNG, max 10 MB each, up to 3 files (front / back / neck labels)
        </p>

        {images.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {images.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
              >
                <FileImage className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  disabled={loading}
                  aria-label={`Remove ${file.name}`}
                  className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {images.length < MAX_FILES && (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-ring hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
                attempted && images.length === 0 && 'border-destructive text-destructive'
              )}
            >
              <UploadCloud className="size-6" />
              <span>Click to upload label image{images.length > 0 ? ' (add another)' : ''}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png"
              multiple
              className="sr-only"
              aria-label="Upload label images"
              onChange={(e) => validateAndAddFiles(e.target.files)}
            />
          </>
        )}

        {attempted && images.length === 0 && (
          <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3 shrink-0" />
            At least one label image is required
          </p>
        )}

        {imageErrors.length > 0 && (
          <ul role="alert" className="flex flex-col gap-0.5">
            {imageErrors.map((msg, i) => (
              <li key={i} className="flex items-start gap-1 text-xs text-destructive">
                <AlertCircle className="size-3 shrink-0 mt-0.5" />
                {msg}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        disabled={loading}
        className="w-full sm:w-auto"
      >
        {loading ? 'Verifying…' : 'Verify Label'}
      </Button>
    </form>
  );
}
