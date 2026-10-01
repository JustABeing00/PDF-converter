import type { SelectedImage } from "../types";

interface Props {
  image: SelectedImage;
  index: number;
  total: number;
  dragging: boolean;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
}

export default function ImageItem({
  image,
  index,
  total,
  dragging,
  onRemove,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  return (
    <li
      className={`thumb${dragging ? " thumb-dragging" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", String(index));
        } catch {
          /* some browsers disallow setData quirks — ignore */
        }
        onDragStart(index);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
      onDragEnd={onDragEnd}
      aria-label={`Image ${index + 1} of ${total}: ${image.name}`}
    >
      <span className="thumb-order" aria-hidden="true">
        {index + 1}
      </span>
      <img src={image.previewUrl} alt={`Preview of ${image.name}`} loading="lazy" draggable={false} />
      <span className="thumb-name" title={image.name}>
        {image.name}
      </span>
      <div className="thumb-actions">
        <button
          type="button"
          className="btn-icon"
          aria-label={`Move ${image.name} earlier`}
          disabled={index === 0}
          onClick={() => onMove(image.id, -1)}
        >
          ←
        </button>
        <button
          type="button"
          className="btn-icon"
          aria-label={`Move ${image.name} later`}
          disabled={index === total - 1}
          onClick={() => onMove(image.id, 1)}
        >
          →
        </button>
        <button
          type="button"
          className="btn-icon btn-remove"
          aria-label={`Remove ${image.name}`}
          onClick={() => onRemove(image.id)}
        >
          ✕
        </button>
      </div>
    </li>
  );
}
