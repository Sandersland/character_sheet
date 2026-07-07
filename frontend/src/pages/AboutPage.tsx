import Card from "@/components/ui/Card";

// About / credits surface — houses third-party asset attribution. The paper-doll
// slot glyphs (#566) come from game-icons.net, used under CC BY 3.0.
export default function AboutPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
      <h1 className="text-2xl font-bold text-parchment-900">About</h1>

      <Card title="Credits & attribution" className="p-4">
        <div className="flex flex-col gap-3 text-sm text-parchment-700">
          <p>
            Interface and paper-doll icons are from{" "}
            <a
              href="https://game-icons.net"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-garnet-700 hover:underline"
            >
              game-icons.net
            </a>
            , used under the{" "}
            <a
              href="https://creativecommons.org/licenses/by/3.0/"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-garnet-700 hover:underline"
            >
              Creative Commons Attribution 3.0 (CC BY 3.0)
            </a>{" "}
            license. Icons are delivered as inline SVG via the{" "}
            <span className="font-mono text-xs">react-icons/gi</span> set.
          </p>
        </div>
      </Card>
    </main>
  );
}
