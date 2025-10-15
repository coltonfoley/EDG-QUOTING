type PriceTileProps = {
  total: number | null;
  housing?: { housing: string; roller: string };
  notes?: string[];
};

export function PriceTile(props: PriceTileProps) {
  return (
    <div className="sticky top-4 rounded-2xl border p-4 shadow-sm bg-white dark:bg-gray-950" data-testid="price-tile">
      <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">Estimated Price</div>
      <div className="text-3xl font-bold my-2 text-gray-900 dark:text-gray-100" data-testid="text-total-price">
        {props.total !== null ? `$${props.total.toLocaleString()}` : "—"}
      </div>
      {props.housing && (
        <div className="text-sm text-gray-600 dark:text-gray-400" data-testid="text-housing-info">
          Housing: <b>{props.housing.housing}</b> · Roller: <b>{props.housing.roller}</b>
        </div>
      )}
      {!!props.notes?.length && (
        <ul className="mt-2 text-xs list-disc ml-4 text-gray-700 dark:text-gray-300" data-testid="list-price-notes">
          {props.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}
