import { useEffect, useMemo, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { client } from "../client";

type Order = Schema["Order"]["type"];
type OrderItem = Schema["OrderItem"]["type"];
type Operator = Schema["Operator"]["type"];

function CalendarPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [filterOperator, setFilterOperator] = useState("");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    const oSub = client.models.Order.observeQuery().subscribe({
      next: (data) => setOrders([...data.items].filter((o) => !o.isDeleted)),
    });
    const oiSub = client.models.OrderItem.observeQuery().subscribe({
      next: (data) => setOrderItems([...data.items]),
    });
    const opSub = client.models.Operator.observeQuery().subscribe({
      next: (data) =>
        setOperators(
          [...data.items].sort((a, b) =>
            (a.name ?? "").localeCompare(b.name ?? "")
          )
        ),
    });
    return () => {
      oSub.unsubscribe();
      oiSub.unsubscribe();
      opSub.unsubscribe();
    };
  }, []);

  const [year, month] = currentMonth.split("-").map(Number);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (!(o.orderDate ?? "").startsWith(currentMonth)) return false;
      if (filterOperator && o.operatorName !== filterOperator) return false;
      return true;
    });
  }, [orders, currentMonth, filterOperator]);

  const ordersByDate = useMemo(() => {
    const map: Record<string, Order[]> = {};
    for (const o of filteredOrders) {
      const day = o.orderDate ?? "";
      if (!map[day]) map[day] = [];
      map[day].push(o);
    }
    // Sort each day's orders by time
    for (const day of Object.keys(map)) {
      map[day].sort((a, b) =>
        (a.orderTime ?? "").localeCompare(b.orderTime ?? "")
      );
    }
    return map;
  }, [filteredOrders]);

  function getItemsForOrder(orderId: string) {
    return orderItems.filter((i) => i.orderId === orderId);
  }

  // Calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDay).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  function prevMonth() {
    const d = new Date(year, month - 2, 1);
    setCurrentMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  function nextMonth() {
    const d = new Date(year, month, 1);
    setCurrentMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="page">
      <section className="panel">
        <div className="cal-toolbar">
          <div className="cal-nav">
            <button className="btn-secondary" onClick={prevMonth}>
              ◀
            </button>
            <h2>
              {year} 年 {month} 月
            </h2>
            <button className="btn-secondary" onClick={nextMonth}>
              ▶
            </button>
          </div>
          <div className="cal-filter">
            <select
              value={filterOperator}
              onChange={(e) => setFilterOperator(e.target.value)}
            >
              <option value="">全部工程師</option>
              {operators.map((op) => (
                <option key={op.id} value={op.name}>
                  {op.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="cal-grid">
          <div className="cal-header">
            {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
              <div key={d} className="cal-header-cell">
                {d}
              </div>
            ))}
          </div>
          {weeks.map((w, wi) => (
            <div key={wi} className="cal-row">
              {w.map((day, di) => {
                if (day === null)
                  return <div key={di} className="cal-cell cal-empty" />;
                const dateStr = `${currentMonth}-${String(day).padStart(2, "0")}`;
                const dayOrders = ordersByDate[dateStr] ?? [];
                const isToday = dateStr === todayStr;
                return (
                  <div
                    key={di}
                    className={`cal-cell ${isToday ? "cal-today" : ""}`}
                  >
                    <div className="cal-day-num">{day}</div>
                    <div className="cal-events">
                      {dayOrders.map((o) => {
                        const items = getItemsForOrder(o.id);
                        return (
                          <div key={o.id} className="cal-event">
                            <span className="cal-event-time">
                              {o.orderTime || ""}
                            </span>
                            <span className="cal-event-name">
                              {o.customerName}
                            </span>
                            {o.operatorName && (
                              <span className="cal-event-op">
                                {o.operatorName}
                              </span>
                            )}
                            {items.length > 0 && (
                              <span className="cal-event-items">
                                {items
                                  .map(
                                    (i) => `${i.productName}×${i.quantity}`
                                  )
                                  .join("、")}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default CalendarPage;
