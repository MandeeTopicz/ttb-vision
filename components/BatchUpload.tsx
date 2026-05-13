'use client';

import { useState, useRef } from 'react';
import { UploadCloud, FileText, Archive, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface Props {
  onSubmit: (formData: FormData) => void;
  loading: boolean;
}

interface FileState {
  file: File;
  error?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BatchUpload({ onSubmit, loading }: Props) {
  const [csvFile, setCsvFile] = useState<FileState | null>(null);
  const [zipFile, setZipFile] = useState<FileState | null>(null);
  const [attempted, setAttempted] = useState(false);

  const csvRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  function handleCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error =
      !file.name.toLowerCase().endsWith('.csv')
        ? 'File must be a .csv'
        : undefined;
    setCsvFile({ file, error });
    if (csvRef.current) csvRef.current.value = '';
  }

  function handleZipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error =
      !file.name.toLowerCase().endsWith('.zip')
        ? 'File must be a .zip archive'
        : file.size > 50 * 1024 * 1024
        ? `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — maximum is 50 MB`
        : undefined;
    setZipFile({ file, error });
    if (zipRef.current) zipRef.current.value = '';
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);

    const csvOk = csvFile && !csvFile.error;
    const zipOk = zipFile && !zipFile.error;
    if (!csvOk || !zipOk) return;

    const fd = new FormData();
    fd.append('csv', csvFile.file);
    fd.append('images', zipFile.file);
    onSubmit(fd);
  }

  const showCsvError = attempted && (!csvFile || csvFile.error);
  const showZipError = attempted && (!zipFile || zipFile.error);

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* CSV upload */}
      <div className="flex flex-col gap-2">
        <Label>CSV Manifest</Label>
        <p className="text-xs text-muted-foreground">
          One row per label. Required columns: brand_name, class_type, abv, net_contents,
          bottler_name, bottler_address, beverage_type, is_import, image_filename.
          Include country_of_origin for imports.
        </p>

        {csvFile ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex-1 truncate">{csvFile.file.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {(csvFile.file.size / 1024).toFixed(0)} KB
            </span>
            <button
              type="button"
              onClick={() => setCsvFile(null)}
              disabled={loading}
              aria-label="Remove CSV file"
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={() => csvRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-ring hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
              showCsvError && 'border-destructive text-destructive'
            )}
          >
            <UploadCloud className="size-6" aria-hidden />
            <span>Click to upload CSV manifest</span>
          </button>
        )}

        <input
          ref={csvRef}
          type="file"
          accept=".csv"
          className="sr-only"
          aria-label="Upload CSV manifest"
          onChange={handleCsvChange}
        />

        {csvFile?.error && (
          <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3 shrink-0" aria-hidden />
            {csvFile.error}
          </p>
        )}
        {!csvFile && attempted && (
          <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3 shrink-0" aria-hidden />
            CSV manifest is required
          </p>
        )}
      </div>

      {/* ZIP upload */}
      <div className="flex flex-col gap-2">
        <Label>Label Images (ZIP)</Label>
        <p className="text-xs text-muted-foreground">
          ZIP archive containing all label images referenced in the CSV. JPEG and PNG only.
          Maximum 50 MB.
        </p>

        {zipFile ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <Archive className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex-1 truncate">{zipFile.file.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {(zipFile.file.size / 1024 / 1024).toFixed(1)} MB
            </span>
            <button
              type="button"
              onClick={() => setZipFile(null)}
              disabled={loading}
              aria-label="Remove ZIP file"
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={() => zipRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-ring hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
              showZipError && 'border-destructive text-destructive'
            )}
          >
            <UploadCloud className="size-6" aria-hidden />
            <span>Click to upload ZIP archive</span>
          </button>
        )}

        <input
          ref={zipRef}
          type="file"
          accept=".zip"
          className="sr-only"
          aria-label="Upload ZIP archive of label images"
          onChange={handleZipChange}
        />

        {zipFile?.error && (
          <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3 shrink-0" aria-hidden />
            {zipFile.error}
          </p>
        )}
        {!zipFile && attempted && (
          <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3 shrink-0" aria-hidden />
            ZIP archive is required
          </p>
        )}
      </div>

      <Button type="submit" size="lg" disabled={loading} className="w-full sm:w-auto">
        {loading ? 'Processing…' : 'Start Batch Verification'}
      </Button>
    </form>
  );
}
