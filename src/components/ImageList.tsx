import { useState } from "react";
import type { SelectedImage } from "../types";
import ImageItem from "./ImageItem";

interface Props {
  images: SelectedImage[];
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onReorder: (from: number, to: number) => void;
}

export default function ImageList({ images, onRemove, onMove, onReorder }: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const handleDrop = (to: number) => {
    if (dragFrom !== null && dragFrom !== to) {
      onReorder(dragFrom, to);
    }
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <ul className="thumb-grid" aria-label="Selected images in PDF order">
      {images.map((image, index) => (
        <ImageItem
          key={image.id}
          image={image}
          index={index}
          total={images.length}
          dragging={dragOver === index && dragFrom !== null && dragFrom !== index}
          onRemove={onRemove}
          onMove={onMove}
          onDragStart={setDragFrom}
          onDragOver={setDragOver}
          onDrop={handleDrop}
          onDragEnd={() => {
            setDragFrom(null);
            setDragOver(null);
          }}
        />
      ))}
    </ul>
  );
}
