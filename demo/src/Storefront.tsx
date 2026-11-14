interface StorefrontProps {
  isOn: (flag: string) => boolean;
  /** Absent for anonymous visitors. */
  name: string | undefined;
  customer: string | undefined;
}

const PRODUCTS = [
  { name: "Canvas tote", price: "$24" },
  { name: "Enamel mug", price: "$16" },
  { name: "Notebook set", price: "$12" },
];

export function Storefront({ isOn, name, customer }: StorefrontProps) {
  return (
    <main className="store">
      {isOn("new-dashboard") ? (
        <section className="card hero" data-flag="new-dashboard">
          <p className="eyebrow">New dashboard</p>
          <h1>Welcome back{name ? `, ${name}` : ""}</h1>
          <p>Your orders, saved items and recommendations, all in one place.</p>
          <p className="why">Shown because new-dashboard is ON for you.</p>
        </section>
      ) : (
        <section className="card" data-flag="classic-home">
          <h1>Welcome to Corner Shop</h1>
          <p>Browse this week's picks below.</p>
        </section>
      )}

      {isOn("beta-reports") && (
        <section className="card beta" data-flag="beta-reports">
          <p className="eyebrow">Beta reports</p>
          <h2>Spending by category{customer ? ` for ${customer}` : ""}</h2>
          <p className="why">Shown because beta-reports is ON{customer ? ` for ${customer}` : ""}.</p>
        </section>
      )}

      <section className="grid" aria-label="Products">
        {PRODUCTS.map((p) => (
          <article key={p.name} className="card product">
            <h3>{p.name}</h3>
            <p>{p.price}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
