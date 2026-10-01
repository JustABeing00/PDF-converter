interface Props {
  count: number;
  isConverting: boolean;
  onClick: () => void;
}

export default function ConvertButton({ count, isConverting, onClick }: Props) {
  return (
    <button
      type="button"
      className="btn btn-primary btn-large"
      disabled={count === 0 || isConverting}
      aria-busy={isConverting}
      onClick={onClick}
    >
      {isConverting ? (
        <span className="spinner-row">
          <span className="spinner" aria-hidden="true" />
          Creating PDF...
        </span>
      ) : (
        `Convert to PDF${count > 0 ? ` (${count})` : ""}`
      )}
    </button>
  );
}
