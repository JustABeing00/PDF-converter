import { useCallback, useEffect, useRef, useState } from "react";
import UploadArea from "./components/UploadArea";
import ImageList from "./components/ImageList";
import ConvertButton from "./components/ConvertButton";
import Pricing from "./components/Pricing";
import { useEntitlement, FREE_DAILY_LIMIT } from "./hooks/useEntitlement";
import { imagesToPdf } from "./utils/imagesToPdf";
import type { SelectedImage } from "./types";
import "./App.css";

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isSupportedFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/jpeg" || type === "image/png" || type === "image/webp") return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

export default function App() {
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);
  const entitlement = useEntitlement();
  const { isPro, freeRemaining, blockReason, recordConvert } = entitlement;

  const setPdfUrlTracked = (url: string | null) => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    pdfUrlRef.current = url;
    setPdfUrl(url);
  };

  // Revoke all object URLs on unmount.
  const imagesRef = useRef<SelectedImage[]>([]);
  imagesRef.current = images;
  useEffect(() => {
    return () => {
      for (const img of imagesRef.current) URL.revokeObjectURL(img.previewUrl);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    };
  }, []);

  const addFiles = useCallback((incoming: File[]) => {
    const supported: File[] = [];
    const rejected: string[] = [];
    for (const f of incoming) {
      if (isSupportedFile(f)) supported.push(f);
      else rejected.push(f.name || "unnamed file");
    }

    if (supported.length > 0) {
      const next: SelectedImage[] = supported.map((file) => ({
        id: makeId(),
        file,
        previewUrl: URL.createObjectURL(file),
        name: file.name || "image",
      }));
      setImages((prev) => [...prev, ...next]);
      setPdfUrlTracked(null); // new content invalidates previous PDF
    }

    if (rejected.length > 0) {
      setError(
        `Skipped ${rejected.length} unsupported file(s). Please use JPG, PNG, or WEBP: ${rejected.slice(0, 3).join(", ")}${rejected.length > 3 ? "…" : ""}`,
      );
    } else {
      setError(null);
    }
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
    setPdfUrlTracked(null);
  }, []);

  const clearAll = useCallback(() => {
    setImages((prev) => {
      for (const i of prev) URL.revokeObjectURL(i.previewUrl);
      return [];
    });
    setPdfUrlTracked(null);
    setError(null);
  }, []);

  const moveImage = useCallback((id: string, direction: -1 | 1) => {
    setImages((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(nextIdx, 0, item);
      return next;
    });
    setPdfUrlTracked(null);
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setImages((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setPdfUrlTracked(null);
  }, []);

  const handleConvert = useCallback(async () => {
    if (images.length === 0 || isConverting) return;
    const blocked = blockReason(images.length);
    if (blocked) {
      setError(blocked);
      document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setIsConverting(true);
    setError(null);
    try {
      const bytes = await imagesToPdf(images.map((i) => i.file));
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPdfUrlTracked(url);
      recordConvert();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong while creating the PDF.");
    } finally {
      setIsConverting(false);
    }
  }, [images, isConverting, blockReason, recordConvert]);

  return (
    <div className="app">
      <nav className="topbar" aria-label="Site">
        <span className="brand">Image to PDF</span>
        <span className="topbar-right">
          {isPro ? (
            <span className="pill pill-pro">PRO</span>
          ) : (
            <span className="quota" title="Free converts left today">
              {freeRemaining}/{FREE_DAILY_LIMIT} free left
            </span>
          )}
          <span className="badge">100% client-side</span>
        </span>
      </nav>
      <header className="header">
        <h1>Image to PDF</h1>
        <p className="subtitle">Convert your images into a PDF.</p>
      </header>

      <main className="main">
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        {images.length === 0 ? (
          <UploadArea onFiles={addFiles} />
        ) : (
          <>
            <p className="count" aria-live="polite">
              {images.length} image{images.length === 1 ? "" : "s"} selected. Drag to reorder.
            </p>

            <ImageList images={images} onRemove={removeImage} onMove={moveImage} onReorder={reorder} />

            <div className="actions">
              <UploadArea compact onFiles={addFiles} />
              <button type="button" className="btn btn-ghost" onClick={clearAll} disabled={isConverting}>
                Clear all
              </button>
            </div>

            <div className="convert-row">
              <ConvertButton count={images.length} isConverting={isConverting} onClick={handleConvert} />
              {!isPro && freeRemaining === 0 && (
                <div className="alert alert-error" role="alert" style={{ marginTop: 12 }}>
                  Daily free limit reached. <a href="#pricing">Upgrade to Pro</a> for unlimited converts.
                </div>
              )}
            </div>

            {pdfUrl && !isConverting && (
              <div className="alert alert-success" role="status">
                <p>Your PDF is ready.</p>
                <a className="btn btn-primary" href={pdfUrl} download="images.pdf">
                  Download PDF
                </a>
              </div>
            )}
          </>
        )}
      </main>

      <div id="pricing">
        <Pricing entitlement={entitlement} />
      </div>

      <footer className="footer">
        <p>Images never leave your device — everything runs in your browser.</p>
        {entitlement.mockMode && (
          <p>
            <button type="button" className="linklike" onClick={entitlement.resetForTesting}>
              Reset free quota / Pro (test helper)
            </button>
          </p>
        )}
      </footer>
    </div>
  );
}
