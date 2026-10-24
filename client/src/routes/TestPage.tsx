import { useParams } from "react-router";

// "/tests/:id" — left: chat (/api/chat), right: tabs Steps | Code | Runs, Run button in header.
// Live updates: EventSource on /api/tests/:id/events (see TestEvent in @agent-tester/shared).
export function TestPage() {
  const { id } = useParams();
  return (
    <main className="grid h-screen grid-cols-2">
      <section className="border-r p-4">Chat for test {id}</section>
      <section className="p-4">Steps panel</section>
    </main>
  );
}
