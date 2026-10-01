import { useRef, useState } from "react";
import { ACCEPT } from "../utils/imagesToPdf";

interface Props {
  onFiles: (files: File[]) => void;
  compact?: boolean;
}

export default function UploadArea({ onFiles, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragCount = useRef(0);

  const emit = (list: FileList | File[] | null | undefined) => {
    if (!list) return;
    const files = Array.from(list);
    if (files.length > 0) onFiles(files);
  };

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          id="add-images-input"
          type="file"
          accept={ACCEPT}
          multiple
          className="visually-hidden"
          onChange={(e) => {
            emit(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => inputRef.current?.click()}
        >
          Add Images
        </button>
      </>
    );
  }

  return (
    <div
      className={`dropzone${dragging ? " dragging" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        dragCount.current += 1;
        if (e.dataTransfer.types.includes("Files")) setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes("Files")) setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCount.current = Math.max(0, dragCount.current - 1);
        if (dragCount.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragCount.current = 0;
        setDragging(false);
        emit(e.dataTransfer.files);
      }}
    >
      <p className="dropzone-title">Drag &amp; drop images here</p>
      <p className="dropzone-sub">JPG, PNG, or WEBP — files stay on your device</p>
      <input
        ref={inputRef}
        id="select-images-input"
        type="file"
        accept={ACCEPT}
        multiple
        className="visually-hidden"
        onChange={(e) => {
          emit(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => inputRef.current?.click()}
      >
        Select Images
      </button>
    </div>
  );
}
