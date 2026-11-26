import {
  ChartColumn,
  Coffee,
  FlaskConical,
  Heart,
  NotebookPen,
  Package,
  ShoppingBag,
  Sparkles,
  ToggleRight,
  Truck,
  type LucideIcon,
} from "lucide-react";

interface StorefrontProps {
  isOn: (flag: string) => boolean;
  /** Absent for anonymous visitors. */
  name: string | undefined;
  customer: string | undefined;
}

const PRODUCTS: { name: string; price: string; icon: LucideIcon }[] = [
  { name: "Canvas tote", price: "$24", icon: ShoppingBag },
  { name: "Enamel mug", price: "$16", icon: Coffee },
  { name: "Notebook set", price: "$12", icon: NotebookPen },
];

const DASHBOARD_TILES: { label: string; value: string; icon: LucideIcon }[] = [
  { label: "Orders", value: "2 on the way", icon: Package },
  { label: "Saved", value: "5 items", icon: Heart },
  { label: "For you", value: "8 picks", icon: Sparkles },
];

/** Made-up spending figures for the beta report. */
const SPENDING = [
  { category: "Home", share: 46 },
  { category: "Kitchen", share: 31 },
  { category: "Stationery", share: 23 },
];

/** "Shown because <flag> is ON": ties what's on screen to the flag that put it there. */
function FlagNote({ flag, suffix }: { flag: string; suffix?: string }) {
  return (
    <p className="flag-note">
      <ToggleRight size={14} aria-hidden="true" />
      <span>
        Shown because <code>{flag}</code> is ON{suffix}.
      </span>
    </p>
  );
}

export function Storefront({ isOn, name, customer }: StorefrontProps) {
  return (
    <main className="store">
      {isOn("new-dashboard") ? (
        <section className="box hero" data-flag="new-dashboard">
          <p className="eyebrow">New dashboard</p>
          <h1>Welcome back{name ? `, ${name}` : ""}</h1>
          <p className="muted">Your orders, saved items and recommendations, all in one place.</p>
          <ul className="tiles">
            {DASHBOARD_TILES.map(({ label, value, icon: Icon }) => (
              <li key={label} className="tile">
                <span className="tile-icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <span>
                  <strong>{label}</strong>
                  <span className="muted small">{value}</span>
                </span>
              </li>
            ))}
          </ul>
          <FlagNote flag="new-dashboard" suffix=" for you" />
        </section>
      ) : (
        <section className="box classic" data-flag="classic-home">
          <h1>Welcome to Corner Shop</h1>
          <p className="muted">Browse this week's picks below.</p>
        </section>
      )}

      {isOn("beta-reports") && (
        <section className="box beta" data-flag="beta-reports">
          <div className="box-head">
            <span className="beta-icon" aria-hidden="true">
              <ChartColumn size={16} />
            </span>
            <h2>Spending by category{customer ? ` for ${customer}` : ""}</h2>
            <span className="label beta-label">
              <FlaskConical size={12} aria-hidden="true" /> Beta
            </span>
          </div>
          <ul className="bars" aria-label="Spending by category">
            {SPENDING.map((s) => (
              <li key={s.category}>
                <span className="bar-label">{s.category}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${s.share}%` }} />
                </span>
                <span className="bar-value">{s.share}%</span>
              </li>
            ))}
          </ul>
          <FlagNote flag="beta-reports" suffix={customer ? ` for ${customer}` : ""} />
        </section>
      )}

      {isOn("free-shipping") && (
        <section className="box shipping" data-flag="free-shipping">
          <div className="box-head">
            <span className="shipping-icon" aria-hidden="true">
              <Truck size={16} />
            </span>
            <h2>Free shipping on every order</h2>
          </div>
          <p className="muted">No minimum spend. Applied at checkout.</p>
          <FlagNote flag="free-shipping" suffix=" where you are" />
        </section>
      )}

      <section aria-labelledby="picks-heading">
        <h2 id="picks-heading" className="section-title">
          This week's picks
        </h2>
        <ul className="grid">
          {PRODUCTS.map(({ name: product, price, icon: Icon }) => (
            <li key={product} className="box product">
              <span className="product-art" aria-hidden="true">
                <Icon size={28} strokeWidth={1.5} />
              </span>
              <h3>{product}</h3>
              <p className="price">{price}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
