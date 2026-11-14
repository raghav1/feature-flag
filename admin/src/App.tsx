import { useQuery } from "@tanstack/react-query";
import { Dashboard } from "./Dashboard";
import { Login } from "./Login";
import { meQuery } from "./queries";

export function App() {
  const me = useQuery(meQuery);

  if (me.isPending) return <p className="centered muted">Loading…</p>;
  if (me.isError) return <p className="centered error">Can't reach the server: {me.error.message}</p>;
  return me.data ? <Dashboard me={me.data} /> : <Login />;
}
