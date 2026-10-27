import { CarnetClient } from "@/components/CarnetClient";

export default function Home() {
  return (
    <div className="wrap">
      <div className="emblem">
        <h1>Carnet de Cendres</h1>
        <p>« On ne se relève pas parce que c&apos;est facile. On se relève parce qu&apos;on l&apos;a déjà fait. »</p>
      </div>
      <CarnetClient />
    </div>
  );
}
