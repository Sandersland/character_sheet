import { useEffect, useState } from "react";

import { checkHealth } from "../api/client";

export default function CharacterListPage() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    checkHealth().then(setBackendOk);
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Characters</h1>
      <p className="text-gray-500">Character list coming soon.</p>
      <p className="mt-4 text-sm">
        Backend:{" "}
        {backendOk === null ? "checking..." : backendOk ? "ok" : "unreachable"}
      </p>
    </div>
  );
}
