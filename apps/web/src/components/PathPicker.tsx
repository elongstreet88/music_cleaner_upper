import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { browsePath } from '../api';

interface PathPickerProps {
  label: string;
  description: string;
  value: string;
  browseRoot: string;
  directoriesOnly?: boolean;
  onChange: (value: string) => void;
}

function getBreadcrumbs(path: string): Array<{ label: string; path: string }> {
  if (!path.startsWith('/')) {
    return [{ label: path, path }];
  }

  const parts = path.split('/').filter(Boolean);
  const breadcrumbs = [{ label: '/', path: '/' }];
  let currentPath = '';

  for (const part of parts) {
    currentPath += `/${part}`;
    breadcrumbs.push({ label: part, path: currentPath });
  }

  return breadcrumbs;
}

export function PathPicker({
  label,
  description,
  value,
  browseRoot,
  directoriesOnly = false,
  onChange,
}: PathPickerProps) {
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserPath, setBrowserPath] = useState(value || browseRoot);
  const [selectedEntryPath, setSelectedEntryPath] = useState<string | null>(null);

  useEffect(() => {
    if (!browserOpen) {
      setBrowserPath(value || browseRoot);
      setSelectedEntryPath(null);
    }
  }, [browserOpen, browseRoot, value]);

  const browseQuery = useQuery({
    queryKey: ['browse', browserPath],
    queryFn: () => browsePath(browserPath),
    enabled: browserOpen,
  });

  const breadcrumbs = useMemo(() => getBreadcrumbs(browserPath), [browserPath]);
  const selectedEntry = browseQuery.data?.entries.find((entry) => entry.path === selectedEntryPath) ?? null;

  function openSelectedEntry() {
    if (!selectedEntry) {
      return;
    }

    if (selectedEntry.kind === 'directory') {
      setBrowserPath(selectedEntry.path);
      setSelectedEntryPath(null);
      return;
    }

    if (!directoriesOnly) {
      onChange(selectedEntry.path);
      setBrowserOpen(false);
    }
  }

  function selectSelectedEntry() {
    if (!selectedEntry) {
      return;
    }

    if (selectedEntry.kind === 'directory') {
      onChange(selectedEntry.path);
      setBrowserOpen(false);
      return;
    }

    if (!directoriesOnly) {
      onChange(selectedEntry.path);
      setBrowserOpen(false);
    }
  }

  return (
    <section className="rounded-2xl border border-base-300 bg-base-200/55 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-base-content">{label}</h3>
          <p className="text-xs text-base-content/60">{description}</p>
        </div>
        <button className="btn btn-xs btn-ghost" type="button" onClick={() => setBrowserOpen((open) => !open)}>
          {browserOpen ? 'Hide' : 'Browse'}
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-2 md:flex-row">
        <input
          aria-label={label}
          className="input input-bordered input-sm w-full font-mono text-xs"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={directoriesOnly ? '/path/to/output-folder' : '/path/to/music-or-folder'}
        />
        {!directoriesOnly ? (
          <button className="btn btn-sm btn-outline" type="button" onClick={() => onChange(browseRoot)}>
            Home
          </button>
        ) : null}
      </div>

      {browserOpen ? (
        <div className="mt-2 rounded-2xl border border-base-300 bg-base-100/72 p-2.5">
          <div className="flex flex-wrap gap-2">
            {breadcrumbs.map((breadcrumb, index) => (
              <button
                key={breadcrumb.path}
                className={`btn btn-xs ${index === breadcrumbs.length - 1 ? 'btn-primary' : 'btn-ghost'}`}
                type="button"
                onClick={() => {
                  setBrowserPath(breadcrumb.path);
                  setSelectedEntryPath(null);
                }}
              >
                {breadcrumb.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn btn-xs btn-outline"
              type="button"
              onClick={() => {
                setBrowserPath(browseQuery.data?.parentPath || browseRoot);
                setSelectedEntryPath(null);
              }}
            >
              Up
            </button>
            <button className="btn btn-xs btn-outline" type="button" onClick={openSelectedEntry} disabled={!selectedEntry}>
              Open selected
            </button>
            <button className="btn btn-xs btn-primary" type="button" onClick={selectSelectedEntry} disabled={!selectedEntry}>
              Select selected
            </button>
            <button className="btn btn-xs btn-ghost" type="button" onClick={() => onChange(browserPath)}>
              Use current folder
            </button>
          </div>

          <p className="mt-3 break-all font-mono text-[11px] text-base-content/60">{browserPath}</p>
          {browseQuery.isLoading ? <p className="mt-2 text-xs text-base-content/60">Loading folder contents…</p> : null}
          {browseQuery.isError ? <p className="mt-2 text-xs text-error">{browseQuery.error.message}</p> : null}

          <div className="mt-3 grid max-h-64 gap-2 overflow-auto pr-1">
            {browseQuery.data?.entries.map((entry) => {
              const disabled = directoriesOnly && entry.kind === 'file';
              const selected = entry.path === selectedEntryPath;

              return (
                <div
                  key={entry.path}
                  className={`flex items-center justify-between gap-3 rounded-box border px-3 py-2 text-sm transition ${selected ? 'border-primary bg-primary/10' : 'border-base-300 bg-base-100'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    if (!disabled) {
                      setSelectedEntryPath(entry.path);
                    }
                  }}
                  onDoubleClick={() => {
                    if (disabled) {
                      return;
                    }

                    if (entry.kind === 'directory') {
                      setBrowserPath(entry.path);
                      setSelectedEntryPath(null);
                      return;
                    }

                    onChange(entry.path);
                    setBrowserOpen(false);
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`badge badge-xs ${entry.kind === 'directory' ? 'badge-primary badge-outline' : 'badge-ghost'}`}>
                        {entry.kind === 'directory' ? 'Folder' : 'File'}
                      </span>
                      <span className="truncate font-medium">{entry.name}</span>
                    </div>
                  </div>
                  <button
                    className="btn btn-xs btn-ghost"
                    type="button"
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation();

                      if (entry.kind === 'directory') {
                        setBrowserPath(entry.path);
                        setSelectedEntryPath(null);
                        return;
                      }

                      onChange(entry.path);
                      setBrowserOpen(false);
                    }}
                  >
                    {entry.kind === 'directory' ? 'Open' : 'Choose'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}