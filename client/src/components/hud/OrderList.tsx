import { useGameStore } from '../../stores/gameStore.js';

export function OrderList() {
  const orders = useGameStore((s) => s.orders);
  const units = useGameStore((s) => s.units);
  const removeOrder = useGameStore((s) => s.removeOrder);
  const phase = useGameStore((s) => s.phase);

  if (phase !== 'planning' || orders.length === 0) return null;

  return (
    <div className="absolute bottom-4 right-4 w-56 rounded-lg border border-slate-700 bg-slate-800/95 p-3 shadow-lg">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Orders ({orders.length})
      </h3>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {orders.map((order) => {
          const unit = units.get(order.unitId);
          const unitLabel = unit
            ? `${unit.unitClass} #${order.unitId}`
            : `#${order.unitId}`;

          const orderColor =
            order.orderType === 'attack'
              ? 'text-red-400'
              : order.orderType === 'move'
                ? 'text-indigo-400'
                : 'text-yellow-400';

          return (
            <li
              key={order.unitId}
              className="flex items-center justify-between rounded bg-slate-700/50 px-2 py-1"
            >
              <div className="text-xs">
                <span className="capitalize text-white">{unitLabel}</span>
                <span className={`ml-1 capitalize ${orderColor}`}>
                  {order.orderType}
                </span>
                <span className="ml-1 text-slate-500">
                  ({order.target.q},{order.target.r})
                </span>
              </div>
              <button
                onClick={() => removeOrder(order.unitId)}
                className="text-xs text-slate-500 hover:text-red-400"
                aria-label={`Cancel order for unit ${order.unitId}`}
              >
                x
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
